#!/usr/bin/env node
/**
 * Rebuild synthetic Unilog pack from vendor CSVs in packages/db/prisma/data/unilog/vendor/.
 * Usage (repo root): node scripts/build-unilog-pack.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../packages/db/prisma/data/unilog');
const vendorIn = path.join(root, 'vendor/sample_input.csv');
const vendorOut = path.join(root, 'vendor/expected_output_delivery_format.csv');

function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (c === '\n') {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (c === '\r') {
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length || row.length) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
}

if (!fs.existsSync(vendorIn) || !fs.existsSync(vendorOut)) {
  console.error('Missing vendor CSVs under packages/db/prisma/data/unilog/vendor/');
  process.exit(1);
}

const outRows = parseCsv(fs.readFileSync(vendorOut, 'utf8').replace(/^\uFEFF/, ''));
const headers = outRows[0];
const goldenVals = outRows[1] || [];
if (headers.length !== 252) {
  console.error('Expected 252 headers, got', headers.length);
  process.exit(1);
}
writeJson('delivery_format_headers.json', headers);
const golden = {};
headers.forEach((h, idx) => {
  golden[h] = goldenVals[idx] || '';
});
writeJson('golden_dishwasher.json', golden);
writeJson('golden_gt.json', {
  sku: 'GOLDEN-PDSH4816AF',
  mpn: 'PDSH4816AF',
  family: 'dishwasher',
  deliveryFormat: golden,
});

const inRows = parseCsv(fs.readFileSync(vendorIn, 'utf8').replace(/^\uFEFF/, ''));
const inHeaders = inRows[0];
const records = inRows.slice(1).map((r) => {
  const o = {};
  inHeaders.forEach((h, idx) => {
    o[h] = r[idx] || '';
  });
  return o;
});

const PLACEHOLDER =
  /^\s*(--\s*)?(unbranded|no unilog brand|no dib brand|commodity\s*-\s*unbranded)(\s*--)?\s*$/i;
function clean(v) {
  if (!v || PLACEHOLDER.test(String(v).trim())) return null;
  return String(v).trim();
}

let brandMaster = [];
const brandPath = path.join(root, 'brand_master.json');
if (fs.existsSync(brandPath)) {
  try {
    brandMaster = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
  } catch {
    brandMaster = [];
  }
}
const seen = new Set(brandMaster.map((b) => b.brandCode));

function addBrand(brandName, manufacturerName, aliases, codeHint) {
  const code = (codeHint || brandName).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code || seen.has(code)) return;
  brandMaster.push({
    brandName,
    brandCode: code,
    manufacturerName,
    manufacturerCode: code.slice(0, 6),
    aliases: aliases || [brandName],
  });
  seen.add(code);
}

[
  ['Diablo', 'Freud Inc', ['DIABLO', 'Freud']],
  ['3M', '3M Company', ['3M', 'CUBITRON']],
  ['Philips', 'Signify North America Corporation', ['PHILIPS']],
  ['DEWALT', 'Stanley Black & Decker, Inc.', ['DEWALT']],
  ['Leviton', 'Leviton Manufacturing Co., Inc.', ['LEVITON']],
  ['TREX', 'Trex Company, Inc.', ['TREX']],
  ['TIMBERTECH', 'Azek Building Products, Inc.', ['TIMBERTECH']],
  ['Milwaukee', 'Milwaukee Electric Tool Corporation', ['MILWAUKEE']],
  ['Kichler', 'Kichler Lighting LLC', ['KICHLER']],
  ['FRIGIDAIRE®', 'Rheem Manufacturing', ['FRIGIDAIRE', 'FRIGIDAIRE®']],
].forEach(([b, m, a]) => addBrand(b, m, a));

for (const r of records) {
  for (const field of ['DIB_Brand', 'E1_Brand']) {
    const v = clean(r[field]);
    if (!v) continue;
    const manuf = clean(r.Part_Manuf);
    const mname = manuf ? manuf.replace(/\s*\([^)]*\)\s*$/, '').trim() : v;
    addBrand(v, mname, [v, v.toUpperCase()]);
  }
}

const TAXONOMY = {
  dishwasher: {
    family: 'dishwasher',
    classpath: 'Appliances & Consumer Electronics>Kitchen Appliances>Built-In Dishwashers',
    dept: 'Appliances',
    class: 'Large Appliances',
    fine: 'Dishwashers',
    productName: 'Dishwasher',
  },
  faucet: {
    family: 'faucet',
    classpath: 'Plumbing > Kitchen & Bath > Sink Faucets',
    dept: 'Plumbing',
    class: 'Faucets',
    fine: 'Kitchen Faucets',
    productName: 'Kitchen Faucet',
  },
  fitting: {
    family: 'fitting',
    classpath: 'Plumbing > Pipe / Tube / Hose Fittings',
    dept: 'Plumbing',
    class: 'Fittings',
    fine: 'Pipe Fittings',
    productName: 'Fitting',
  },
  lighting: {
    family: 'lighting',
    classpath: 'Lighting > Indoor Lighting > Light Fixtures',
    dept: 'Electrical',
    class: 'Lighting',
    fine: 'Fixtures',
    productName: 'Light Fixture',
  },
  decking: {
    family: 'decking',
    classpath: 'Building Materials > Exterior > Decking',
    dept: 'Building Materials',
    class: 'Decking',
    fine: 'Composite Decking',
    productName: 'Decking',
  },
  abrasive: {
    family: 'abrasive',
    classpath: 'Tools & Hardware > Abrasives > Discs & Belts',
    dept: 'Tools',
    class: 'Abrasives',
    fine: 'Sanding Discs & Belts',
    productName: 'Abrasive',
  },
  tool: {
    family: 'tool',
    classpath: 'Tools & Hardware > Power Tool Accessories',
    dept: 'Tools',
    class: 'Accessories',
    fine: 'Power Tool Accessories',
    productName: 'Tool Accessory',
  },
  electrical: {
    family: 'electrical',
    classpath: 'Electrical > Wiring Devices > Switches & Outlets',
    dept: 'Electrical',
    class: 'Wiring Devices',
    fine: 'Devices',
    productName: 'Electrical Device',
  },
  other: {
    family: 'other',
    classpath: 'General Merchandise > Unclassified',
    dept: 'General',
    class: 'Unclassified',
    fine: 'Other',
    productName: 'Product',
  },
};

function classifyDesc(d) {
  const t = String(d).toLowerCase();
  if (/dishwasher|frigidaire|pdsh/.test(t)) return 'dishwasher';
  if (/faucet|fauc|pulldn|pull-dn/.test(t)) return 'faucet';
  if (/\bcplg\b|coupling|\bell\b|elbow|\btee\b|fitting|npt|150#/.test(t)) return 'fitting';
  if (/sand|disc|belt|grit|stikit|cubitron|abrasive|p\d{2,3}\b/.test(t)) return 'abrasive';
  if (/light|lamp|led|bulb|fixture|kichler|philips/.test(t)) return 'lighting';
  if (/trex|timbertech|deck|railing|fascia/.test(t)) return 'decking';
  if (/dewalt|milwaukee|drill|bit|saw|blade|diablo/.test(t)) return 'tool';
  if (/leviton|outlet|switch|gfci|dimmer|wire/.test(t)) return 'electrical';
  return 'other';
}

const sampleItems = records.map((r, i) => {
  const family = classifyDesc(r.Part_Desc);
  return {
    sku: `UNI-S${String(i + 1).padStart(4, '0')}`,
    mfgPartNum: r.Mfg_Part_Num,
    partDesc: r.Part_Desc,
    e1Brand: r.E1_Brand,
    unilogBrand: r.Unilog_Brand,
    dibBrand: r.DIB_Brand,
    partManuf: r.Part_Manuf,
    familyHint: family,
  };
});

const byFam = {};
for (const it of sampleItems) {
  (byFam[it.familyHint] ||= []).push(it);
}
const scored = [];
for (const fam of ['abrasive', 'lighting', 'decking', 'tool', 'electrical', 'dishwasher', 'other']) {
  for (const it of (byFam[fam] || []).slice(0, 12)) {
    scored.push({
      sku: it.sku,
      mpn: it.mfgPartNum,
      classpath: TAXONOMY[fam].classpath,
      dept: TAXONOMY[fam].dept,
      className: TAXONOMY[fam].class,
      fine: TAXONOMY[fam].fine,
      productName: TAXONOMY[fam].productName,
      needsReview: fam === 'other',
      family: fam,
    });
  }
}

const lovCategories = {
  dishwasher: {
    classpath: TAXONOMY.dishwasher.classpath,
    attributes: {
      Series: ['Professional Series'],
      'Number of Wash Cycles': ['3', '4', '5', '6'],
      'Voltage Rating': ['120', '240'],
      'Amperage Rating': ['15', '20'],
      'Mounting Type': ['Leg', 'Built-In', 'Portable'],
      Material: ['Stainless Steel', 'Plastic', 'Porcelain'],
      'Sound Level': ['42', '44', '47', '50', '54'],
    },
    attributeOrder: [
      'Series',
      'Model',
      'Number of Wash Cycles',
      'Voltage Rating',
      'Amperage Rating',
      'Mounting Type',
      'Plug Type',
      'Size',
      'Depth With Door Open',
      'Sound Level',
      'Material',
    ],
  },
  lighting: {
    classpath: TAXONOMY.lighting.classpath,
    attributes: {
      'Bulb Type': ['LED', 'Incandescent', 'Halogen', 'CFL'],
      Finish: ['Brushed Nickel', 'Chrome', 'Black', 'White', 'Bronze'],
      'Mounting Type': ['Ceiling', 'Wall', 'Recessed', 'Pendant', 'Flush Mount'],
      Wattage: ['5', '9', '10', '15', '20', '40', '60'],
      'Voltage Rating': ['120', '12', '24'],
    },
    attributeOrder: ['Bulb Type', 'Finish', 'Mounting Type', 'Wattage', 'Voltage Rating', 'Size'],
  },
  decking: {
    classpath: TAXONOMY.decking.classpath,
    attributes: {
      Material: ['Composite', 'PVC', 'Wood', 'Aluminum'],
      Color: ['Brown', 'Gray', 'Cedar', 'Mahogany', 'Black', 'White'],
      Profile: ['Grooved', 'Solid', 'Fascia', 'Railing'],
    },
    attributeOrder: ['Material', 'Color', 'Profile', 'Size'],
  },
  abrasive: {
    classpath: TAXONOMY.abrasive.classpath,
    attributes: {
      Grit: ['P40', 'P60', 'P80', 'P100', 'P120', 'P150', 'P180', 'P220'],
      'Abrasive Type': ['Sanding Belt', 'Sanding Disc', 'Sheet', 'Roll'],
      Backing: ['Film', 'Paper', 'Cloth'],
      'Brand Line': ['Cubitron II', 'Stikit', 'Diablo'],
    },
    attributeOrder: ['Abrasive Type', 'Grit', 'Backing', 'Brand Line', 'Size'],
  },
  tool: {
    classpath: TAXONOMY.tool.classpath,
    attributes: {
      'Tool Type': ['Drill Bit', 'Saw Blade', 'Driver Bit', 'Hole Saw', 'Accessory'],
      Material: ['Carbide', 'HSS', 'Diamond', 'Steel'],
      Shank: ['Hex', 'Round', 'SDS'],
    },
    attributeOrder: ['Tool Type', 'Material', 'Shank', 'Size'],
  },
  electrical: {
    classpath: TAXONOMY.electrical.classpath,
    attributes: {
      'Device Type': ['Switch', 'Outlet', 'Dimmer', 'GFCI', 'Cover Plate'],
      'Amperage Rating': ['15', '20', '30'],
      'Voltage Rating': ['120', '240', '277'],
      Color: ['White', 'Ivory', 'Black', 'Gray'],
    },
    attributeOrder: ['Device Type', 'Amperage Rating', 'Voltage Rating', 'Color'],
  },
};

let uom = {
  approvedAbbreviations: {},
  houseRules: [],
  fractionDecimal: [],
};
const uomPath = path.join(root, 'uom_rules.json');
if (fs.existsSync(uomPath)) uom = JSON.parse(fs.readFileSync(uomPath, 'utf8'));
Object.assign(uom.approvedAbbreviations, {
  inch: 'in',
  inches: 'in',
  'in.': 'in',
  '"': 'in',
  pc: 'pc',
  pcs: 'pc',
  volt: 'V',
  volts: 'V',
  v: 'V',
  amp: 'A',
  amps: 'A',
  watt: 'W',
  watts: 'W',
  w: 'W',
  dba: 'dBA',
  gpm: 'gpm',
});

writeJson('brand_master.json', brandMaster);
writeJson('taxonomy.json', TAXONOMY);
writeJson('lov_categories.json', lovCategories);
writeJson('uom_rules.json', uom);
writeJson('sample_items.json', sampleItems);
writeJson('scored_subset.json', scored);

console.log(
  JSON.stringify(
    {
      headers: headers.length,
      sampleItems: sampleItems.length,
      brandMaster: brandMaster.length,
      scoredSubset: scored.length,
      goldenMpn: golden.Mfg_Part_Num || golden.MANUFACTURER_PART_NUMBER,
    },
    null,
    2,
  ),
);
