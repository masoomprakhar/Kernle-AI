import * as fs from 'fs';
import * as path from 'path';
import type { BrandMasterRow } from './brand-resolve';
import type { UomRules } from './uom';
import type { LovPack } from './extract';
import type { GroundTruthRow } from './eval';
import type { TaxonomyEntry, UnilogFamily } from './classify';
import type { DeliveryFormatRow } from './delivery-format-types';

export function resolveUnilogDataDir(): string {
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
  const dir = resolveUnilogDataDir();
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
}

function readJsonOptional<T>(file: string, fallback: T): T {
  const dir = resolveUnilogDataDir();
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

export type SampleItem = {
  sku: string;
  mfgPartNum: string;
  partDesc: string;
  e1Brand: string;
  unilogBrand: string;
  dibBrand: string;
  partManuf?: string;
  familyHint: string;
};

export type ScoredSubsetRow = {
  sku: string;
  mpn: string;
  classpath: string;
  dept: string;
  className: string;
  fine: string;
  productName: string;
  needsReview: boolean;
  family: string;
};

export type GoldenGt = {
  sku: string;
  mpn: string;
  family: string;
  deliveryFormat: DeliveryFormatRow;
};

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
    partManuf?: string;
  }>;
  sampleItems: SampleItem[];
  scoredSubset: ScoredSubsetRow[];
  goldenGt: GoldenGt | null;
  deliveryFormatHeaders: string[];
  taxonomy: Partial<Record<UnilogFamily, TaxonomyEntry>>;
} {
  const faucets = readJson<LovPack['faucets']>('lov_faucets.json');
  const fittings = readJson<LovPack['fittings']>('lov_fittings.json');
  const categories = readJsonOptional<LovPack['categories']>('lov_categories.json', {});
  return {
    brandMaster: readJson('brand_master.json'),
    uomRules: readJson('uom_rules.json'),
    lov: { faucets, fittings, categories },
    groundTruth: readJson('ground_truth.json'),
    rawItems: readJson('raw_items.json'),
    sampleItems: readJsonOptional('sample_items.json', []),
    scoredSubset: readJsonOptional('scored_subset.json', []),
    goldenGt: readJsonOptional('golden_gt.json', null),
    deliveryFormatHeaders: readJson('delivery_format_headers.json'),
    taxonomy: readJsonOptional('taxonomy.json', {}),
  };
}
