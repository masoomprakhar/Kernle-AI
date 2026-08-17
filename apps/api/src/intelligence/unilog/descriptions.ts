export type DescFields = {
  invoice_desc: string;
  mobile_desc: string;
  product_title: string;
  long_description: string;
  short_desc: string;
  retail_desc: string;
  marketing_description: string;
  features: string[];
  withPhrase: string;
  productName: string;
};

export const DESC_LIMITS = {
  invoice_desc: { max: 40 },
  mobile_desc: { min: 60, max: 80 },
  product_title: { max: 180 },
  long_description: { max: 600 },
  short_desc: { max: 180 },
  retail_desc: { max: 120 },
  marketing_description: { max: 400 },
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
  withPhrase?: string;
}): DescFields {
  const brandPlain = input.brand.replace(/[®™]/g, '').trim();
  const keys = input.keyAttrs.filter(Boolean).slice(0, 6);
  const productName = input.itemType;

  const invoiceCore = [brandPlain, input.itemType, ...keys]
    .join(' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  const invoice_desc = clip(invoiceCore, DESC_LIMITS.invoice_desc.max);

  let mobile = `${input.manufacturer} ${brandPlain}, ${input.itemType}, ${input.mpn}`;
  if (input.finishOrMaterial) mobile += `, ${input.finishOrMaterial}`;
  mobile = expandToMin(mobile, DESC_LIMITS.mobile_desc.min, keys.join(', ') || input.itemType);
  const mobile_desc = clip(mobile, DESC_LIMITS.mobile_desc.max);

  const short_desc = clip(
    [input.brand, keys.includes('Professional Series') ? 'Professional Series' : null, input.mpn, input.itemType, ...keys]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' '),
    DESC_LIMITS.short_desc.max,
  );

  const product_title = short_desc;

  const long_description = clip(
    [
      `${input.brand} ${input.itemType}`,
      input.withPhrase || null,
      keys.length ? keys.join(', ') : null,
      input.finishOrMaterial ? `${input.finishOrMaterial}` : null,
      `Model ${input.mpn}`,
    ]
      .filter(Boolean)
      .join(', ')
      .replace(/,\s*,/g, ','),
    DESC_LIMITS.long_description.max,
  );

  const retail_desc = clip(
    [input.itemType, ...keys.slice(0, 3), input.finishOrMaterial].filter(Boolean).join(', '),
    DESC_LIMITS.retail_desc.max,
  );

  const marketing_description = clip(
    long_description,
    DESC_LIMITS.marketing_description.max,
  );

  const features = keys.slice(0, 20);

  return {
    invoice_desc,
    mobile_desc,
    product_title,
    long_description,
    short_desc,
    retail_desc,
    marketing_description,
    features,
    withPhrase: input.withPhrase || '',
    productName,
  };
}

export function checkDescLimits(
  fields: Partial<Pick<DescFields, 'invoice_desc' | 'mobile_desc' | 'product_title' | 'long_description'>>,
): Array<{ field: string; ok: boolean; length: number; rule: string }> {
  const out: Array<{ field: string; ok: boolean; length: number; rule: string }> = [];
  const subset = {
    invoice_desc: DESC_LIMITS.invoice_desc,
    mobile_desc: DESC_LIMITS.mobile_desc,
    product_title: DESC_LIMITS.product_title,
    long_description: DESC_LIMITS.long_description,
  };
  for (const [field, limits] of Object.entries(subset) as Array<
    [keyof typeof subset, { min?: number; max: number }]
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
