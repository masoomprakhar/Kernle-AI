export type DescFields = {
  invoice_desc: string;
  mobile_desc: string;
  product_title: string;
  long_description: string;
};

export const DESC_LIMITS = {
  invoice_desc: { max: 40 },
  mobile_desc: { min: 60, max: 80 },
  product_title: { max: 180 },
  long_description: { max: 600 },
} as const;

function clip(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function expandToMin(s: string, min: number, pad: string) {
  let out = s;
  while (out.length < min) {
    const next = `${out}; ${pad}`;
    if (next.length > DESC_LIMITS.mobile_desc.max) break;
    out = next;
  }
  return out;
}

/** Build Unilog-style multi-format descriptions from structured fields. */
export function buildDescriptions(input: {
  brand: string;
  manufacturer: string;
  mpn: string;
  itemType: string;
  keyAttrs: string[];
  finishOrMaterial?: string;
}): DescFields {
  const brandPlain = input.brand.replace(/[®™]/g, '').trim();
  const keys = input.keyAttrs.filter(Boolean).slice(0, 4);

  const invoiceCore = [brandPlain, input.itemType, ...keys]
    .join(' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  const invoice_desc = clip(invoiceCore, DESC_LIMITS.invoice_desc.max);

  let mobile = `${input.manufacturer} ${input.brand}, ${input.itemType}, ${input.mpn}`;
  if (input.finishOrMaterial) mobile += `, ${input.finishOrMaterial}`;
  mobile = expandToMin(mobile, DESC_LIMITS.mobile_desc.min, keys.join(', ') || input.itemType);
  const mobile_desc = clip(mobile, DESC_LIMITS.mobile_desc.max);

  const product_title = clip(
    [input.brand, input.mpn, input.itemType, ...keys].filter(Boolean).join(', ').replace(/,+/g, ','),
    DESC_LIMITS.product_title.max,
  );

  const long_description = clip(
    [
      `${input.brand} ${input.itemType}`,
      `Model ${input.mpn}`,
      keys.length ? keys.join(', ') : null,
      input.finishOrMaterial ? `${input.finishOrMaterial} construction/finish` : null,
      `Manufacturer: ${input.manufacturer}.`,
      'Enriched for distributor search and channel syndication.',
    ]
      .filter(Boolean)
      .join('. ')
      .replace(/\.\./g, '.'),
    DESC_LIMITS.long_description.max,
  );

  return { invoice_desc, mobile_desc, product_title, long_description };
}

export function checkDescLimits(fields: Partial<DescFields>): Array<{ field: string; ok: boolean; length: number; rule: string }> {
  const out: Array<{ field: string; ok: boolean; length: number; rule: string }> = [];
  for (const [field, limits] of Object.entries(DESC_LIMITS) as Array<
    [keyof typeof DESC_LIMITS, { min?: number; max: number }]
  >) {
    const val = fields[field] || '';
    const len = val.length;
    let ok = len <= limits.max;
    let rule = `max ${limits.max}`;
    if (limits.min != null) {
      ok = ok && len >= limits.min;
      rule = `${limits.min}-${limits.max}`;
    }
    out.push({ field, ok, length: len, rule });
  }
  return out;
}
