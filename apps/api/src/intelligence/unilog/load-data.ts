import * as fs from 'fs';
import * as path from 'path';
import type { BrandMasterRow } from './brand-resolve';
import type { UomRules } from './uom';
import type { LovPack } from './extract';
import type { GroundTruthRow } from './eval';

function resolveDataDir(): string {
  const candidates = [
    path.join(process.cwd(), 'packages/db/prisma/data/unilog'),
    path.join(process.cwd(), '../../packages/db/prisma/data/unilog'),
    path.join(__dirname, '../../../../../packages/db/prisma/data/unilog'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'brand_master.json'))) return c;
  }
  throw new Error('Unilog data directory not found (packages/db/prisma/data/unilog)');
}

function readJson<T>(file: string): T {
  const dir = resolveDataDir();
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
}

export function loadUnilogPack(): {
  brandMaster: BrandMasterRow[];
  uomRules: UomRules;
  lov: LovPack;
  groundTruth: GroundTruthRow[];
  rawItems: Array<{
    sku: string;
    mfgPartNum: string;
    partDesc: string;
    e1Brand: string;
    unilogBrand: string;
    dibBrand: string;
    familyHint: string;
  }>;
} {
  const faucets = readJson<LovPack['faucets']>('lov_faucets.json');
  const fittings = readJson<LovPack['fittings']>('lov_fittings.json');
  return {
    brandMaster: readJson('brand_master.json'),
    uomRules: readJson('uom_rules.json'),
    lov: { faucets, fittings },
    groundTruth: readJson('ground_truth.json'),
    rawItems: readJson('raw_items.json'),
  };
}
