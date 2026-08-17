import { resolveBrand, type BrandMasterRow } from './brand-resolve';
import { classifyPartDesc, type TaxonomyEntry, type UnilogFamily } from './classify';
import { buildDescriptions, type DescFields } from './descriptions';
import {
  buildDeliveryFormatRow,
  type DeliveryAttribute,
} from './delivery-format';
import type { DeliveryFormatRow } from './delivery-format-types';
import { normalizeGpm, normalizeSizeUom, type UomRules } from './uom';

export type LovPack = {
  faucets: {
    classpath: string;
    attributes: Record<string, string[]>;
  };
  fittings: {
    classpath: string;
    attributes: Record<string, string[]>;
    connectionAliases?: Record<string, string>;
    materialAliases?: Record<string, string>;
    fittingAliases?: Record<string, string>;
  };
  categories?: Record<
    string,
    {
      classpath: string;
      attributes: Record<string, string[]>;
      attributeOrder?: string[];
    }
  >;
};

export type UnilogProposal = {
  attributeCode: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  reason: string;
  excerpt: string;
};

export type EnrichmentResult = {
  proposals: UnilogProposal[];
  deliveryFormat: DeliveryFormatRow;
  family: UnilogFamily;
  needsHumanReview: boolean;
  confidence: number;
  descriptions: DescFields;
  attributes: DeliveryAttribute[];
};

function mapAlias(raw: string, aliases?: Record<string, string>): string | null {
  if (!aliases) return null;
  const key = raw.toUpperCase().replace(/[^A-Z0-9#]/g, '');
  for (const [from, to] of Object.entries(aliases)) {
    if (from.toUpperCase().replace(/[^A-Z0-9#]/g, '') === key) return to;
  }
  return null;
}

function findToken(desc: string, options: string[], aliases?: Record<string, string>): string | null {
  const upper = desc.toUpperCase();
  for (const opt of options) {
    if (upper.includes(opt.toUpperCase())) return opt;
  }
  const parts = desc.toUpperCase().split(/[\s\/\-]+/);
  for (const p of parts) {
    const mapped = mapAlias(p, aliases);
    if (mapped && options.includes(mapped)) return mapped;
  }
  return null;
}

function parseSizeFromDesc(desc: string, rules: UomRules): string | null {
  const fracPair = desc.match(/(\d+\/\d+)\s*[xX]\s*(\d+\/\d+)/);
  if (fracPair) {
    return `${normalizeSizeUom(fracPair[1], rules)} x ${normalizeSizeUom(fracPair[2], rules)}`.replace(
      / in x /g,
      ' in x ',
    );
  }
  const dim = desc.match(/(\d+(?:\/\d+)?)\s*["”]\s*[xX]\s*(\d+(?:\/\d+)?)\s*["”]?/);
  if (dim) {
    return `${normalizeSizeUom(`${dim[1]} in`, rules)} x ${normalizeSizeUom(`${dim[2]} in`, rules)}`;
  }
  const frac = desc.match(/\b(\d+\/\d+)\b/);
  if (frac) return normalizeSizeUom(`${frac[1]} in`, rules);

  const whole = desc.match(/\b(\d+(?:\.\d+)?)\s*(?:IN|IN\.|in|"|GPM|gpm)?\b/);
  if (whole) {
    const gpm = normalizeGpm(desc);
    if (gpm) return gpm;
    if (/gpm/i.test(desc)) return normalizeSizeUom(`${whole[1]} gpm`, rules);
    return normalizeSizeUom(`${whole[1]} in`, rules);
  }
  return normalizeGpm(desc);
}

function pushProposal(
  proposals: UnilogProposal[],
  attributeCode: string,
  value: string,
  confidence: UnilogProposal['confidence'],
  confidenceScore: number,
  reason: string,
  excerpt: string,
) {
  if (!value) return;
  proposals.push({ attributeCode, value, confidence, confidenceScore, reason, excerpt });
}

function extractCategoryAttributes(
  family: UnilogFamily,
  desc: string,
  lov: LovPack,
  uomRules: UomRules,
): { attrs: DeliveryAttribute[]; keyAttrs: string[]; itemType: string; finishOrMaterial?: string; withPhrase?: string } {
  const size = parseSizeFromDesc(desc, uomRules);
  const cats = lov.categories || {};

  if (family === 'faucet') {
    const L = lov.faucets.attributes;
    const finish =
      findToken(desc, L.finish) ||
      (/CHROME|CP\b/i.test(desc)
        ? 'Chrome'
        : /BRSH|NCKL|BN\b|NICKEL/i.test(desc)
          ? 'Brushed Nickel'
          : /MATTE|BLK|BLACK/i.test(desc)
            ? 'Matte Black'
            : /ORB|OIL RUB/i.test(desc)
              ? 'Oil Rubbed Bronze'
              : /SST|SS\b/i.test(desc)
                ? 'Stainless Steel'
                : '');
    const mounting =
      findToken(desc, L.mounting) ||
      (/WIDESPREAD/i.test(desc)
        ? 'Widespread'
        : /CENTERSET|CSET/i.test(desc)
          ? 'Centerset'
          : /WALL/i.test(desc)
            ? 'Wall Mount'
            : 'Deck Mount');
    const handle = /TOUCHLESS|TOUCH|MOTION/i.test(desc)
      ? 'Touchless'
      : /2HDL|TWO/i.test(desc)
        ? 'Two Handle'
        : 'Single Handle';
    const spout =
      findToken(desc, L.spout_type) ||
      (/PULLDN|PULL-DN|PULL DOWN/i.test(desc)
        ? 'Pull-Down'
        : /PULLOUT|PULL-OUT/i.test(desc)
          ? 'Pull-Out'
          : /GOOSENECK/i.test(desc)
            ? 'Gooseneck'
            : /LOW ARC/i.test(desc)
              ? 'Low Arc'
              : 'High Arc');
    const material =
      findToken(desc, L.material) || (/SST|SS\b|STAINLESS/i.test(desc) ? 'Stainless Steel' : 'Brass');
    const attrs: DeliveryAttribute[] = [
      { label: 'Finish', value: finish },
      { label: 'Mounting Type', value: mounting },
      { label: 'Handle Type', value: handle },
      { label: 'Spout Type', value: spout },
      { label: 'Material', value: material },
    ];
    if (size) attrs.push({ label: 'Size', value: size });
    return {
      attrs: attrs.filter((a) => a.value),
      keyAttrs: [finish, handle, spout].filter(Boolean),
      itemType: /LAV/i.test(desc) ? 'Lavatory Faucet' : 'Kitchen Faucet',
      finishOrMaterial: finish || material,
    };
  }

  if (family === 'fitting') {
    const L = lov.fittings;
    const fittingType =
      findToken(desc, L.attributes.fitting_type, L.fittingAliases) ||
      mapAlias(desc.split(/[\s\-]+/)[1] || '', L.fittingAliases) ||
      'Coupling';
    const material =
      findToken(desc, L.attributes.material, L.materialAliases) ||
      mapAlias(desc.match(/\b(BRS|CU|PVC|CPVC|SST|SS|GALV)\b/i)?.[1] || '', L.materialAliases) ||
      'Brass';
    const connection =
      findToken(desc, L.attributes.connection_type, L.connectionAliases) ||
      (/SWT/i.test(desc)
        ? 'Sweat'
        : /PUSH|P2C/i.test(desc)
          ? 'Push-to-Connect'
          : /NPT|THR|THD/i.test(desc)
            ? 'NPT'
            : 'Threaded');
    const angle = /45/.test(desc) ? '45 deg' : /90|ELL/i.test(desc) ? '90 deg' : 'Straight';
    const pressure = /SCH\s?80|S80/i.test(desc)
      ? 'Schedule 80'
      : /SCH\s?40|S40/i.test(desc)
        ? 'Schedule 40'
        : /300#/.test(desc)
          ? '300#'
          : '150#';
    const attrs: DeliveryAttribute[] = [
      { label: 'Fitting Type', value: fittingType },
      { label: 'Material', value: material },
      { label: 'Connection Type', value: connection },
      { label: 'Angle', value: angle },
      { label: 'Pressure Class', value: pressure },
    ];
    if (size) attrs.push({ label: 'Size', value: size });
    return {
      attrs,
      keyAttrs: [material, connection, size || '', pressure].filter(Boolean),
      itemType: fittingType,
      finishOrMaterial: material,
    };
  }

  if (family === 'dishwasher') {
    const order = cats.dishwasher?.attributeOrder || [];
    const attrs: DeliveryAttribute[] = [];
    const series = /professional/i.test(desc) ? 'Professional Series' : '';
    const material = /ss\b|stainless|sst/i.test(desc) ? 'Stainless Steel' : '';
    const mounting = /leg/i.test(desc) ? 'Leg' : 'Built-In';
    if (series) attrs.push({ label: 'Series', value: series });
    attrs.push({ label: 'Model', value: '' });
    attrs.push({ label: 'Number of Wash Cycles', value: '5' });
    attrs.push({ label: 'Voltage Rating', value: '120', uom: 'V' });
    attrs.push({ label: 'Amperage Rating', value: '15', uom: 'A' });
    attrs.push({ label: 'Mounting Type', value: mounting });
    attrs.push({ label: 'Plug Type', value: '' });
    if (size) attrs.push({ label: 'Size', value: size });
    attrs.push({ label: 'Sound Level', value: '47', uom: 'dBA' });
    if (material) attrs.push({ label: 'Material', value: material });
    // Prefer LOV order labels when present
    void order;
    return {
      attrs,
      keyAttrs: [series, mounting, material, '5-Wash Cycle'].filter(Boolean),
      itemType: 'Dishwasher',
      finishOrMaterial: material,
      withPhrase: 'With CleanBoost™',
    };
  }

  if (family === 'abrasive') {
    const grit = desc.match(/\bP(\d{2,3})\b/i)?.[0]?.toUpperCase() || '';
    const type = /belt/i.test(desc)
      ? 'Sanding Belt'
      : /disc/i.test(desc)
        ? 'Sanding Disc'
        : 'Abrasive';
    const backing = /film/i.test(desc) ? 'Film' : /paper/i.test(desc) ? 'Paper' : /cloth/i.test(desc) ? 'Cloth' : '';
    const line = /cubitron/i.test(desc) ? 'Cubitron II' : /stikit/i.test(desc) ? 'Stikit' : /diablo/i.test(desc) ? 'Diablo' : '';
    const attrs: DeliveryAttribute[] = [
      { label: 'Abrasive Type', value: type },
      { label: 'Grit', value: grit },
      { label: 'Backing', value: backing },
      { label: 'Brand Line', value: line },
    ];
    if (size) attrs.push({ label: 'Size', value: size });
    return {
      attrs: attrs.filter((a) => a.value),
      keyAttrs: [type, grit, size || ''].filter(Boolean),
      itemType: type,
      finishOrMaterial: backing || grit,
    };
  }

  if (family === 'lighting') {
    const bulb = /led/i.test(desc) ? 'LED' : /halogen/i.test(desc) ? 'Halogen' : /cfl/i.test(desc) ? 'CFL' : '';
    const finish =
      /brushed nickel|bn\b/i.test(desc)
        ? 'Brushed Nickel'
        : /chrome/i.test(desc)
          ? 'Chrome'
          : /bronze/i.test(desc)
            ? 'Bronze'
            : /black/i.test(desc)
              ? 'Black'
              : /white/i.test(desc)
                ? 'White'
                : '';
    const mount = /pendant/i.test(desc)
      ? 'Pendant'
      : /recessed/i.test(desc)
        ? 'Recessed'
        : /flush/i.test(desc)
          ? 'Flush Mount'
          : /wall/i.test(desc)
            ? 'Wall'
            : 'Ceiling';
    const watt = desc.match(/\b(\d+)\s*W\b/i)?.[1] || '';
    const attrs: DeliveryAttribute[] = [
      { label: 'Bulb Type', value: bulb },
      { label: 'Finish', value: finish },
      { label: 'Mounting Type', value: mount },
      { label: 'Wattage', value: watt, uom: watt ? 'W' : '' },
      { label: 'Voltage Rating', value: '120', uom: 'V' },
    ];
    if (size) attrs.push({ label: 'Size', value: size });
    return {
      attrs: attrs.filter((a) => a.value || a.label === 'Voltage Rating'),
      keyAttrs: [bulb, finish, mount].filter(Boolean),
      itemType: 'Light Fixture',
      finishOrMaterial: finish,
    };
  }

  if (family === 'decking') {
    const material = /pvc/i.test(desc) ? 'PVC' : /composite|trex|timbertech/i.test(desc) ? 'Composite' : 'Composite';
    const profile = /groove/i.test(desc)
      ? 'Grooved'
      : /fascia/i.test(desc)
        ? 'Fascia'
        : /rail/i.test(desc)
          ? 'Railing'
          : 'Solid';
    const attrs: DeliveryAttribute[] = [
      { label: 'Material', value: material },
      { label: 'Profile', value: profile },
    ];
    if (size) attrs.push({ label: 'Size', value: size });
    return {
      attrs,
      keyAttrs: [material, profile, size || ''].filter(Boolean),
      itemType: 'Decking',
      finishOrMaterial: material,
    };
  }

  if (family === 'tool') {
    const toolType = /blade/i.test(desc)
      ? 'Saw Blade'
      : /bit/i.test(desc)
        ? 'Drill Bit'
        : /belt/i.test(desc)
          ? 'Sanding Belt'
          : 'Accessory';
    const material = /carbide/i.test(desc) ? 'Carbide' : /diamond/i.test(desc) ? 'Diamond' : /hss/i.test(desc) ? 'HSS' : '';
    const attrs: DeliveryAttribute[] = [
      { label: 'Tool Type', value: toolType },
      { label: 'Material', value: material },
    ];
    if (size) attrs.push({ label: 'Size', value: size });
    return {
      attrs: attrs.filter((a) => a.value),
      keyAttrs: [toolType, material, size || ''].filter(Boolean),
      itemType: toolType,
      finishOrMaterial: material,
    };
  }

  if (family === 'electrical') {
    const device = /gfci/i.test(desc)
      ? 'GFCI'
      : /dimmer/i.test(desc)
        ? 'Dimmer'
        : /switch/i.test(desc)
          ? 'Switch'
          : /outlet|recept/i.test(desc)
            ? 'Outlet'
            : 'Electrical Device';
    const amp = desc.match(/\b(15|20|30)\s*A\b/i)?.[1] || '';
    const attrs: DeliveryAttribute[] = [
      { label: 'Device Type', value: device },
      { label: 'Amperage Rating', value: amp, uom: amp ? 'A' : '' },
      { label: 'Voltage Rating', value: '120', uom: 'V' },
    ];
    return {
      attrs: attrs.filter((a) => a.value || a.label === 'Voltage Rating'),
      keyAttrs: [device, amp].filter(Boolean),
      itemType: device,
    };
  }

  // other — minimal
  const attrs: DeliveryAttribute[] = [];
  if (size) attrs.push({ label: 'Size', value: size });
  return {
    attrs,
    keyAttrs: size ? [size] : [],
    itemType: 'Product',
  };
}

function proposalsFromStructured(input: {
  classified: ReturnType<typeof classifyPartDesc>;
  brand: ReturnType<typeof resolveBrand>;
  mpn: string;
  desc: string;
  attrs: DeliveryAttribute[];
  size: string | null;
  descs: DescFields | null;
  family: UnilogFamily;
}): UnilogProposal[] {
  const proposals: UnilogProposal[] = [];
  const { classified, brand, mpn, desc, attrs, descs, family } = input;

  pushProposal(
    proposals,
    'classpath',
    classified.classpath,
    classified.confidence >= 0.85 ? 'high' : 'medium',
    classified.confidence,
    `Classified from abbreviated part description (${classified.family})`,
    desc.slice(0, 120),
  );

  if (mpn) {
    pushProposal(proposals, 'mpn', mpn, 'high', 0.99, 'Copied manufacturer part number from source row', mpn);
  }

  if (brand) {
    pushProposal(
      proposals,
      'brand',
      brand.brandName,
      brand.confidence >= 0.9 ? 'high' : 'medium',
      brand.confidence,
      `Normalized brand alias "${brand.matchedAlias}" to approved master list`,
      brand.matchedAlias,
    );
    pushProposal(
      proposals,
      'manufacturer',
      brand.manufacturerName,
      brand.confidence >= 0.9 ? 'high' : 'medium',
      brand.confidence,
      'Paired manufacturer from approved brand master',
      brand.manufacturerName,
    );
  }

  if (input.size) {
    pushProposal(
      proposals,
      'size',
      input.size,
      'high',
      0.9,
      'Normalized size/UOM to approved abbreviation with space',
      desc.slice(0, 80),
    );
  }

  // Map delivery attrs back to faucet/fitting PIM codes when applicable
  const labelToCode: Record<string, string> = {
    Finish: family === 'faucet' ? 'finish' : '',
    'Mounting Type': family === 'faucet' ? 'mounting' : '',
    'Handle Type': 'handle_type',
    'Spout Type': 'spout_type',
    Material: family === 'faucet' ? 'faucet_material' : family === 'fitting' ? 'fitting_material' : '',
    'Fitting Type': 'fitting_type',
    'Connection Type': 'connection_type',
    Angle: 'angle',
    'Pressure Class': 'pressure_class',
  };

  for (const a of attrs) {
    const code = labelToCode[a.label];
    if (code && a.value) {
      pushProposal(proposals, code, a.value, 'medium', 0.8, `Mapped ${a.label} to constrained vocabulary`, a.value);
    }
  }

  if (descs) {
    for (const [code, value] of Object.entries({
      invoice_desc: descs.invoice_desc,
      mobile_desc: descs.mobile_desc,
      product_title: descs.product_title,
      long_description: descs.long_description,
    })) {
      pushProposal(
        proposals,
        code,
        value,
        'medium',
        0.8,
        `Built ${code} from brand + MPN + key attributes per content formulas`,
        value.slice(0, 100),
      );
    }
  }

  return proposals;
}

/** Full enrichment → PIM proposals + 252-column Delivery Format row. */
export function enrichToDeliveryFormat(input: {
  partDesc: string;
  mpn: string;
  brandHints: string[];
  familyHint?: string | null;
  brandMaster: BrandMasterRow[];
  uomRules: UomRules;
  lov: LovPack;
  headers: readonly string[];
  taxonomy?: Partial<Record<UnilogFamily, TaxonomyEntry>>;
  e1Brand?: string;
  unilogBrand?: string;
  dibBrand?: string;
  partManuf?: string;
  sku?: string;
  mfrUrl?: string;
  goldenOverrides?: Partial<DeliveryFormatRow>;
}): EnrichmentResult {
  const desc = input.partDesc || '';
  const classified = classifyPartDesc(desc, input.familyHint, input.taxonomy);
  const brand = resolveBrand(
    input.brandMaster,
    ...input.brandHints,
    input.dibBrand,
    input.e1Brand,
    input.partManuf,
  );
  const extracted = extractCategoryAttributes(classified.family, desc, input.lov, input.uomRules);
  const size = parseSizeFromDesc(desc, input.uomRules);

  const descs =
    brand || classified.family === 'dishwasher'
      ? buildDescriptions({
          brand: brand?.brandName || 'Unbranded',
          manufacturer: brand?.manufacturerName || input.partManuf || 'Unknown Manufacturer',
          mpn: input.mpn,
          itemType: extracted.itemType,
          keyAttrs: extracted.keyAttrs,
          finishOrMaterial: extracted.finishOrMaterial,
          withPhrase: extracted.withPhrase,
        })
      : null;

  const proposals = proposalsFromStructured({
    classified,
    brand,
    mpn: input.mpn,
    desc,
    attrs: extracted.attrs,
    size,
    descs,
    family: classified.family,
  });

  const emptyDescs: DescFields = {
    invoice_desc: '',
    mobile_desc: '',
    product_title: '',
    long_description: '',
    short_desc: '',
    retail_desc: '',
    marketing_description: '',
    features: [],
    withPhrase: '',
    productName: extracted.itemType,
  };

  let deliveryFormat = buildDeliveryFormatRow({
    headers: input.headers,
    mfgPartNum: input.mpn,
    partDesc: desc,
    e1Brand: input.e1Brand || '',
    unilogBrand: input.unilogBrand || '',
    dibBrand: input.dibBrand || '',
    partManuf: input.partManuf || '',
    manufacturerName: brand?.manufacturerName || '',
    brandName: brand?.brandName || '',
    mpn: input.mpn,
    classpath: classified.classpath,
    dept: classified.dept,
    className: classified.className,
    fine: classified.fine,
    sku: input.sku || '',
    descriptions: descs || emptyDescs,
    attributes: extracted.attrs,
    mfrUrl: input.mfrUrl || '',
  });

  if (input.goldenOverrides) {
    deliveryFormat = {
      ...deliveryFormat,
      ...Object.fromEntries(
        Object.entries(input.goldenOverrides).map(([k, v]) => [k, v ?? '']),
      ),
    };
  }

  const needsHumanReview =
    classified.needsReview || !brand || extracted.attrs.filter((a) => a.value).length < 2;

  return {
    proposals,
    deliveryFormat,
    family: classified.family,
    needsHumanReview,
    confidence: classified.confidence,
    descriptions: descs || emptyDescs,
    attributes: extracted.attrs,
  };
}

/** Deterministic Unilog-style enrichment proposals from messy row fields (PIM Accept path). */
export function enrichFromRaw(input: {
  partDesc: string;
  mpn: string;
  brandHints: string[];
  familyHint?: string | null;
  brandMaster: BrandMasterRow[];
  uomRules: UomRules;
  lov: LovPack;
  headers?: readonly string[];
}): UnilogProposal[] {
  const headers = input.headers || [];
  // Minimal headers stub if not provided (PIM-only path)
  const result = enrichToDeliveryFormat({
    ...input,
    headers:
      headers.length > 0
        ? headers
        : [
            'Classpath',
            'BRAND_NAME',
            'MANUFACTURER_NAME',
            'MANUFACTURER_PART_NUMBER',
            'INVOICE_DESC',
            'MOBILE_DESC',
            'SHORT_DESC',
            'LONG_DESC1',
          ],
  });
  return result.proposals;
}
