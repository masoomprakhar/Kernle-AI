import { checkDescLimits } from './descriptions';
import { flattenValue } from '../consistency';

export type GroundTruthRow = Record<string, string> & { sku: string };

const EVAL_FIELDS = [
  'brand',
  'manufacturer',
  'mpn',
  'classpath',
  'finish',
  'mounting',
  'handle_type',
  'spout_type',
  'faucet_material',
  'fitting_type',
  'fitting_material',
  'connection_type',
  'angle',
  'pressure_class',
  'size',
  'invoice_desc',
  'mobile_desc',
  'product_title',
  'long_description',
] as const;

/** Map ground-truth "material" onto family-specific attribute codes when scoring. */
function gtValue(row: GroundTruthRow, code: string): string | undefined {
  if (row[code]) return row[code];
  if ((code === 'faucet_material' || code === 'fitting_material') && row.material) {
    return row.material;
  }
  return undefined;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scoreAgainstGroundTruth(input: {
  groundTruth: GroundTruthRow[];
  /** sku → attributeCode → value (from accepted product values or pending suggestions) */
  actualBySku: Record<string, Record<string, string>>;
  lovValuesByAttr?: Record<string, string[]>;
}): {
  sampleSize: number;
  fieldAccuracy: number;
  fieldsChecked: number;
  fieldsMatched: number;
  byField: Array<{ field: string; matched: number; total: number; rate: number }>;
  lovHitRate: number;
  lovChecked: number;
  lovHits: number;
  charLimitCompliance: number;
  charLimitChecked: number;
  charLimitOk: number;
  perSku: Array<{ sku: string; matched: number; total: number; rate: number }>;
} {
  const byField = new Map<string, { matched: number; total: number }>();
  let fieldsChecked = 0;
  let fieldsMatched = 0;
  let lovChecked = 0;
  let lovHits = 0;
  let charLimitChecked = 0;
  let charLimitOk = 0;
  const perSku: Array<{ sku: string; matched: number; total: number; rate: number }> = [];

  for (const gt of input.groundTruth) {
    const actual = input.actualBySku[gt.sku] || {};
    let skuMatched = 0;
    let skuTotal = 0;

    for (const field of EVAL_FIELDS) {
      const expected = gtValue(gt, field);
      if (expected == null || expected === '') continue;
      const got = actual[field];
      if (got == null || got === '') continue;

      skuTotal += 1;
      fieldsChecked += 1;
      const bucket = byField.get(field) || { matched: 0, total: 0 };
      bucket.total += 1;

      if (norm(got) === norm(expected) || norm(got).includes(norm(expected)) || norm(expected).includes(norm(got))) {
        fieldsMatched += 1;
        skuMatched += 1;
        bucket.matched += 1;
      }
      byField.set(field, bucket);

      const lov = input.lovValuesByAttr?.[field];
      if (lov?.length) {
        lovChecked += 1;
        if (lov.some((v) => norm(v) === norm(got))) lovHits += 1;
      }
    }

    const descCheck = checkDescLimits({
      invoice_desc: actual.invoice_desc,
      mobile_desc: actual.mobile_desc,
      product_title: actual.product_title,
      long_description: actual.long_description,
    });
    for (const row of descCheck) {
      if (!actual[row.field]) continue;
      charLimitChecked += 1;
      if (row.ok) charLimitOk += 1;
    }

    perSku.push({
      sku: gt.sku,
      matched: skuMatched,
      total: skuTotal,
      rate: skuTotal ? skuMatched / skuTotal : 0,
    });
  }

  return {
    sampleSize: input.groundTruth.length,
    fieldAccuracy: fieldsChecked ? fieldsMatched / fieldsChecked : 0,
    fieldsChecked,
    fieldsMatched,
    byField: [...byField.entries()]
      .map(([field, v]) => ({
        field,
        matched: v.matched,
        total: v.total,
        rate: v.total ? v.matched / v.total : 0,
      }))
      .sort((a, b) => b.total - a.total),
    lovHitRate: lovChecked ? lovHits / lovChecked : 0,
    lovChecked,
    lovHits,
    charLimitCompliance: charLimitChecked ? charLimitOk / charLimitChecked : 0,
    charLimitChecked,
    charLimitOk,
    perSku,
  };
}

export function valuesFromProductJson(values: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!values) return out;
  for (const [k, v] of Object.entries(values)) {
    const flat = flattenValue(v);
    if (flat) out[k] = flat;
  }
  return out;
}

const DELIVERY_SCORE_FIELDS = [
  'Classpath',
  'BRAND_NAME',
  'MANUFACTURER_NAME',
  'MANUFACTURER_PART_NUMBER',
  'INVOICE_DESC',
  'MOBILE_DESC',
  'SHORT_DESC',
  'LONG_DESC1',
  'Product Name',
  'Dept',
  'Class',
  'Fine',
] as const;

/** Score a Delivery Format prediction against a golden Delivery Format row. */
export function scoreDeliveryFormatRow(input: {
  expected: Record<string, string>;
  actual: Record<string, string>;
  fields?: readonly string[];
}): {
  fieldsChecked: number;
  fieldsMatched: number;
  fieldAccuracy: number;
  byField: Array<{ field: string; matched: boolean; expected: string; actual: string }>;
} {
  const fields = input.fields || DELIVERY_SCORE_FIELDS;
  const byField: Array<{ field: string; matched: boolean; expected: string; actual: string }> = [];
  let fieldsChecked = 0;
  let fieldsMatched = 0;
  for (const field of fields) {
    const expected = (input.expected[field] || '').trim();
    if (!expected) continue;
    const actual = (input.actual[field] || '').trim();
    fieldsChecked += 1;
    const matched =
      !!actual &&
      (norm(actual) === norm(expected) ||
        norm(actual).includes(norm(expected)) ||
        norm(expected).includes(norm(actual)));
    if (matched) fieldsMatched += 1;
    byField.push({ field, matched, expected, actual });
  }
  return {
    fieldsChecked,
    fieldsMatched,
    fieldAccuracy: fieldsChecked ? fieldsMatched / fieldsChecked : 0,
    byField,
  };
}
