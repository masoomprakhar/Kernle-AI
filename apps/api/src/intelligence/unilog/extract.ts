import { resolveBrand, type BrandMasterRow } from './brand-resolve';
import { classifyPartDesc } from './classify';
import { buildDescriptions } from './descriptions';
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
};

export type UnilogProposal = {
  attributeCode: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  reason: string;
  excerpt: string;
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
  // alias tokens in abbreviated desc
  const parts = desc.toUpperCase().split(/[\s\/\-]+/);
  for (const p of parts) {
    const mapped = mapAlias(p, aliases);
    if (mapped && options.includes(mapped)) return mapped;
  }
  return null;
}

function parseSizeFromDesc(desc: string, rules: UomRules): string | null {
  // 3/4X1/2 or 3/8 or 1/2
  const fracPair = desc.match(/(\d+\/\d+)\s*[xX]\s*(\d+\/\d+)/);
  if (fracPair) {
    return `${normalizeSizeUom(fracPair[1], rules)} x ${normalizeSizeUom(fracPair[2], rules)}`.replace(/ in x /g, ' in x ');
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
  const gpm = normalizeGpm(desc);
  return gpm;
}

/** Deterministic Unilog-style enrichment proposals from messy row fields. */
export function enrichFromRaw(input: {
  partDesc: string;
  mpn: string;
  brandHints: string[];
  familyHint?: string | null;
  brandMaster: BrandMasterRow[];
  uomRules: UomRules;
  lov: LovPack;
}): UnilogProposal[] {
  const proposals: UnilogProposal[] = [];
  const desc = input.partDesc || '';
  const classified = classifyPartDesc(desc, input.familyHint);
  const brand = resolveBrand(input.brandMaster, ...input.brandHints);

  proposals.push({
    attributeCode: 'classpath',
    value: classified.classpath,
    confidence: classified.confidence >= 0.85 ? 'high' : 'medium',
    confidenceScore: classified.confidence,
    reason: `Classified from abbreviated part description (${classified.family})`,
    excerpt: desc.slice(0, 120),
  });

  if (input.mpn) {
    proposals.push({
      attributeCode: 'mpn',
      value: input.mpn,
      confidence: 'high',
      confidenceScore: 0.99,
      reason: 'Copied manufacturer part number from source row',
      excerpt: input.mpn,
    });
  }

  if (brand) {
    proposals.push({
      attributeCode: 'brand',
      value: brand.brandName,
      confidence: brand.confidence >= 0.9 ? 'high' : 'medium',
      confidenceScore: brand.confidence,
      reason: `Normalized brand alias "${brand.matchedAlias}" to approved master list`,
      excerpt: brand.matchedAlias,
    });
    proposals.push({
      attributeCode: 'manufacturer',
      value: brand.manufacturerName,
      confidence: brand.confidence >= 0.9 ? 'high' : 'medium',
      confidenceScore: brand.confidence,
      reason: 'Paired manufacturer from approved brand master',
      excerpt: brand.manufacturerName,
    });
  }

  const size = parseSizeFromDesc(desc, input.uomRules);
  if (size) {
    proposals.push({
      attributeCode: 'size',
      value: size,
      confidence: 'high',
      confidenceScore: 0.9,
      reason: 'Normalized size/UOM to approved abbreviation with space',
      excerpt: desc.slice(0, 80),
    });
  }

  let itemType = classified.family === 'faucet' ? 'Kitchen Faucet' : 'Fitting';
  const keyAttrs: string[] = [];
  let finishOrMaterial: string | undefined;

  if (classified.family === 'faucet') {
    const L = input.lov.faucets.attributes;
    const finish = findToken(desc, L.finish);
    const mounting = findToken(desc, L.mounting) || (/WIDESPREAD/i.test(desc) ? 'Widespread' : /CENTERSET|CSET/i.test(desc) ? 'Centerset' : /WALL/i.test(desc) ? 'Wall Mount' : 'Deck Mount');
    const handle = /TOUCHLESS|TOUCH|MOTION/i.test(desc)
      ? 'Touchless'
      : /2HDL|TWO/i.test(desc)
        ? 'Two Handle'
        : 'Single Handle';
    const spout = findToken(desc, L.spout_type) || (/PULLDN|PULL-DN|PULL DOWN/i.test(desc)
      ? 'Pull-Down'
      : /PULLOUT|PULL-OUT/i.test(desc)
        ? 'Pull-Out'
        : /GOOSENECK/i.test(desc)
          ? 'Gooseneck'
          : /LOW ARC/i.test(desc)
            ? 'Low Arc'
            : 'High Arc');
    const material = findToken(desc, L.material) || (/SST|SS\b|STAINLESS/i.test(desc) ? 'Stainless Steel' : 'Brass');

    if (finish) {
      proposals.push({
        attributeCode: 'finish',
        value: finish,
        confidence: 'high',
        confidenceScore: 0.88,
        reason: 'Mapped finish token from part description to faucet LOV',
        excerpt: finish,
      });
      keyAttrs.push(finish);
      finishOrMaterial = finish;
    } else if (/CHROME|CP\b/i.test(desc)) {
      proposals.push({
        attributeCode: 'finish',
        value: 'Chrome',
        confidence: 'medium',
        confidenceScore: 0.72,
        reason: 'Inferred Chrome finish from CHROME/CP abbreviation',
        excerpt: 'CHROME',
      });
      keyAttrs.push('Chrome');
      finishOrMaterial = 'Chrome';
    } else if (/BRSH|NCKL|BN\b|NICKEL/i.test(desc)) {
      proposals.push({
        attributeCode: 'finish',
        value: 'Brushed Nickel',
        confidence: 'medium',
        confidenceScore: 0.72,
        reason: 'Inferred Brushed Nickel from BRSH/NCKL abbreviation',
        excerpt: 'BRSH NCKL',
      });
      keyAttrs.push('Brushed Nickel');
      finishOrMaterial = 'Brushed Nickel';
    } else if (/MATTE|BLK|BLACK|BL\b/i.test(desc)) {
      proposals.push({
        attributeCode: 'finish',
        value: 'Matte Black',
        confidence: 'medium',
        confidenceScore: 0.7,
        reason: 'Inferred Matte Black from MATTE/BLK abbreviation',
        excerpt: 'MATTE BLK',
      });
      keyAttrs.push('Matte Black');
      finishOrMaterial = 'Matte Black';
    } else if (/ORB|OIL RUB/i.test(desc)) {
      proposals.push({
        attributeCode: 'finish',
        value: 'Oil Rubbed Bronze',
        confidence: 'medium',
        confidenceScore: 0.7,
        reason: 'Inferred Oil Rubbed Bronze from ORB abbreviation',
        excerpt: 'ORB',
      });
      keyAttrs.push('Oil Rubbed Bronze');
      finishOrMaterial = 'Oil Rubbed Bronze';
    } else if (/SST|SS\b/i.test(desc)) {
      proposals.push({
        attributeCode: 'finish',
        value: 'Stainless Steel',
        confidence: 'medium',
        confidenceScore: 0.68,
        reason: 'Inferred Stainless Steel finish from SST/SS token',
        excerpt: 'SST',
      });
      keyAttrs.push('Stainless Steel');
      finishOrMaterial = 'Stainless Steel';
    }

    proposals.push(
      {
        attributeCode: 'mounting',
        value: mounting,
        confidence: 'medium',
        confidenceScore: 0.75,
        reason: 'Inferred mounting style from description keywords',
        excerpt: mounting,
      },
      {
        attributeCode: 'handle_type',
        value: handle,
        confidence: 'medium',
        confidenceScore: 0.74,
        reason: 'Inferred handle type from description keywords',
        excerpt: handle,
      },
      {
        attributeCode: 'spout_type',
        value: spout,
        confidence: 'medium',
        confidenceScore: 0.74,
        reason: 'Inferred spout type from description keywords',
        excerpt: spout,
      },
      {
        attributeCode: 'faucet_material',
        value: material,
        confidence: 'medium',
        confidenceScore: 0.7,
        reason: 'Mapped body material to faucet LOV',
        excerpt: material,
      },
    );
    keyAttrs.push(handle, spout);
    if (/LAV/i.test(desc)) itemType = 'Lavatory Faucet';
  } else {
    const L = input.lov.fittings;
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
      (/SWT/i.test(desc) ? 'Sweat' : /PUSH|P2C/i.test(desc) ? 'Push-to-Connect' : /NPT|THR|THD/i.test(desc) ? 'NPT' : 'Threaded');
    const angle = /45/.test(desc) ? '45 deg' : /90|ELL/i.test(desc) ? '90 deg' : 'Straight';
    const pressure = /SCH\s?80|S80/i.test(desc)
      ? 'Schedule 80'
      : /SCH\s?40|S40/i.test(desc)
        ? 'Schedule 40'
        : /300#/.test(desc)
          ? '300#'
          : /150#/.test(desc)
            ? '150#'
            : '150#';

    itemType = fittingType;
    finishOrMaterial = material;
    keyAttrs.push(material, connection, size || '', pressure);

    proposals.push(
      {
        attributeCode: 'fitting_type',
        value: fittingType,
        confidence: 'high',
        confidenceScore: 0.9,
        reason: 'Mapped fitting type abbreviation to fittings LOV',
        excerpt: fittingType,
      },
      {
        attributeCode: 'fitting_material',
        value: material,
        confidence: 'high',
        confidenceScore: 0.88,
        reason: 'Mapped material abbreviation to fittings LOV',
        excerpt: material,
      },
      {
        attributeCode: 'connection_type',
        value: connection,
        confidence: 'high',
        confidenceScore: 0.86,
        reason: 'Mapped connection variant to canonical LOV value',
        excerpt: connection,
      },
      {
        attributeCode: 'angle',
        value: angle,
        confidence: 'medium',
        confidenceScore: 0.8,
        reason: 'Inferred angle from ELL/45/90 tokens',
        excerpt: angle,
      },
      {
        attributeCode: 'pressure_class',
        value: pressure,
        confidence: 'medium',
        confidenceScore: 0.78,
        reason: 'Inferred pressure/schedule class from description',
        excerpt: pressure,
      },
    );
  }

  if (brand) {
    const descs = buildDescriptions({
      brand: brand.brandName,
      manufacturer: brand.manufacturerName,
      mpn: input.mpn,
      itemType,
      keyAttrs: keyAttrs.filter(Boolean),
      finishOrMaterial,
    });
    for (const [code, value] of Object.entries(descs)) {
      proposals.push({
        attributeCode: code,
        value,
        confidence: 'medium',
        confidenceScore: 0.8,
        reason: `Built ${code} from brand + MPN + key attributes per content formulas`,
        excerpt: value.slice(0, 100),
      });
    }
  }

  return proposals;
}
