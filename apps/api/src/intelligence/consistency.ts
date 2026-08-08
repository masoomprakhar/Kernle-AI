export type FlatProduct = {
  id: string;
  sku: string;
  familyId: string | null;
  values: Record<string, unknown>;
};

export type AttributeMeta = {
  id: string;
  code: string;
  type: string;
  unit?: string | null;
  options?: unknown;
};

export type ConsistencyFindingDraft = {
  category: string;
  severity: string;
  title: string;
  description: string;
  entityType?: string;
  entityId?: string;
  fixAction?: Record<string, unknown>;
};

/** Flatten PIM value shapes to a display string. */
export function flattenValue(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw).trim();
  }
  if (Array.isArray(raw)) {
    const first = raw[0] as { data?: unknown } | undefined;
    if (first && typeof first === 'object' && 'data' in first) {
      return flattenValue(first.data);
    }
    return raw.map(flattenValue).filter(Boolean).join(', ');
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, any>;
    if ('data' in obj) return flattenValue(obj.data);
    const parts: string[] = [];
    for (const channel of Object.values(obj)) {
      if (channel && typeof channel === 'object') {
        for (const v of Object.values(channel as object)) {
          const s = flattenValue(v);
          if (s) parts.push(s);
        }
      } else {
        const s = flattenValue(channel);
        if (s) parts.push(s);
      }
    }
    return parts[0] || '';
  }
  return '';
}

export function normalizeVariantKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 %./]/g, '');
}

/** Common abbreviation clusters for material/finish-like text. */
const ABBREV_GROUPS: string[][] = [
  ['stainless steel', 'stainless', 'ss', 'stainlesssteel'],
  ['aluminum', 'aluminium', 'al'],
  ['polyester', 'pes'],
  ['cotton', 'ctn'],
];

function abbrevCanonical(normalized: string): string {
  for (const group of ABBREV_GROUPS) {
    if (group.includes(normalized)) return group[0];
  }
  return normalized;
}

export function clusterKey(value: string): string {
  return abbrevCanonical(normalizeVariantKey(value));
}

const UNIT_RE = /([\d.]+)\s*(kg|g|lb|lbs|oz|cm|mm|m|in|inch|inches|"|')\b/i;

export function detectUnitToken(value: string): string | null {
  const m = value.match(UNIT_RE);
  if (!m) return null;
  const u = m[2].toLowerCase();
  if (u === 'lbs' || u === 'lb') return 'lb';
  if (u === 'inches' || u === 'inch' || u === '"' || u === "'") return 'in';
  return u;
}

/**
 * Select/text near-duplicate variants within a family for one attribute.
 */
export function findVariantInconsistencies(
  familyId: string,
  familyCode: string,
  attribute: AttributeMeta,
  products: FlatProduct[],
): ConsistencyFindingDraft | null {
  const usableTypes = new Set(['select', 'multiselect', 'text']);
  if (!usableTypes.has(attribute.type)) return null;

  const variants = new Map<string, { display: string; productIds: string[]; skus: string[] }>();

  for (const p of products) {
    if (p.familyId !== familyId) continue;
    const flat = flattenValue(p.values[attribute.code]);
    if (!flat) continue;
    const key = clusterKey(flat);
    const row = variants.get(key) || { display: flat, productIds: [], skus: [] };
    if (!row.productIds.includes(p.id)) {
      row.productIds.push(p.id);
      row.skus.push(p.sku);
    }
    // Prefer longer/title-case display as canonical candidate
    if (flat.length > row.display.length) row.display = flat;
    variants.set(key, row);
  }

  // Within a cluster key we already merged abbreviations. Detect casing/spacing
  // duplicates that map to same key but were written differently — also surface
  // when multiple raw forms exist under same key via raw tracking.
  const rawForms = new Map<string, Set<string>>();
  for (const p of products) {
    if (p.familyId !== familyId) continue;
    const flat = flattenValue(p.values[attribute.code]);
    if (!flat) continue;
    const key = clusterKey(flat);
    if (!rawForms.has(key)) rawForms.set(key, new Set());
    rawForms.get(key)!.add(flat);
  }

  const inconsistentClusters = [...rawForms.entries()].filter(([, forms]) => forms.size > 1);
  if (!inconsistentClusters.length) return null;

  const allForms = inconsistentClusters.flatMap(([, forms]) => [...forms]);
  const canonical = pickCanonical(allForms);
  const mapping: Record<string, string> = {};
  for (const form of allForms) {
    if (form !== canonical) mapping[form] = canonical;
  }

  return {
    category: 'consistency',
    severity: 'medium',
    title: `Attribute ${attribute.code} has ${allForms.length} inconsistent value variants`,
    description: `Family ${familyCode}: variants [${allForms.join(', ')}] — proposed canonical "${canonical}"`,
    entityType: 'Attribute',
    entityId: attribute.id,
    fixAction: {
      type: 'merge_to_canonical',
      attributeCode: attribute.code,
      attributeId: attribute.id,
      familyId,
      canonical,
      mapping,
      reversible: true,
    },
  };
}

export function pickCanonical(forms: string[]): string {
  // Prefer Title Case / longest common-looking form
  return [...forms].sort((a, b) => {
    const score = (s: string) => {
      let n = s.length;
      if (/^[A-Z]/.test(s)) n += 5;
      if (s === s.toLowerCase()) n -= 2;
      return n;
    };
    return score(b) - score(a);
  })[0];
}

/**
 * Numeric/metric unit inconsistency across products in a family.
 */
export function findUnitInconsistencies(
  familyId: string,
  familyCode: string,
  attribute: AttributeMeta,
  products: FlatProduct[],
): ConsistencyFindingDraft | null {
  const usable = new Set(['number', 'metric', 'text', 'price']);
  if (!usable.has(attribute.type)) return null;

  const units = new Map<string, string[]>();
  for (const p of products) {
    if (p.familyId !== familyId) continue;
    const flat = flattenValue(p.values[attribute.code]);
    if (!flat) continue;
    const unit = detectUnitToken(flat) || (attribute.unit ? attribute.unit.toLowerCase() : null);
    if (!unit) continue;
    const skus = units.get(unit) || [];
    skus.push(p.sku);
    units.set(unit, skus);
  }

  if (units.size < 2) return null;
  const unitList = [...units.keys()];

  return {
    category: 'consistency',
    severity: 'high',
    title: `Attribute ${attribute.code} mixes units (${unitList.join(', ')})`,
    description: `Family ${familyCode}: unit variants across products — pick one unit system and normalize.`,
    entityType: 'Attribute',
    entityId: attribute.id,
    fixAction: {
      type: 'unit_inconsistency',
      attributeCode: attribute.code,
      attributeId: attribute.id,
      familyId,
      units: unitList,
    },
  };
}

/**
 * Propose canonical option list from freeform values (deterministic grouping).
 */
export function proposeCanonicalOptions(
  attribute: AttributeMeta,
  products: FlatProduct[],
): {
  mapping: Array<{ oldValue: string; canonicalValue: string }>;
  proposedOptions: string[];
} {
  const clusters = new Map<string, string[]>();
  for (const p of products) {
    const flat = flattenValue(p.values[attribute.code]);
    if (!flat) continue;
    const key = clusterKey(flat);
    const list = clusters.get(key) || [];
    if (!list.includes(flat)) list.push(flat);
    clusters.set(key, list);
  }

  const mapping: Array<{ oldValue: string; canonicalValue: string }> = [];
  const proposedOptions: string[] = [];

  for (const [, forms] of clusters) {
    const canonical = pickCanonical(forms);
    proposedOptions.push(canonical);
    for (const form of forms) {
      mapping.push({ oldValue: form, canonicalValue: canonical });
    }
  }

  proposedOptions.sort((a, b) => a.localeCompare(b));
  return { mapping, proposedOptions };
}

/**
 * Near-duplicate scoring: Jaccard over non-empty attribute value tokens in a family.
 * Returns pairs with score >= threshold.
 */
export function findNearDuplicates(
  familyId: string,
  familyCode: string,
  products: FlatProduct[],
  threshold = 0.85,
): ConsistencyFindingDraft[] {
  const inFamily = products.filter((p) => p.familyId === familyId);
  const findings: ConsistencyFindingDraft[] = [];

  const signatures = inFamily.map((p) => ({
    product: p,
    tokens: productValueTokens(p),
  }));

  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const a = signatures[i];
      const b = signatures[j];
      if (a.tokens.size < 2 || b.tokens.size < 2) continue;
      const score = jaccard(a.tokens, b.tokens);
      if (score < threshold) continue;

      const diffs = differingFields(a.product, b.product);
      findings.push({
        category: 'near_duplicate',
        severity: score >= 0.95 ? 'high' : 'medium',
        title: `Possible duplicate: ${a.product.sku} ≈ ${b.product.sku}`,
        description: `Family ${familyCode}: similarity ${(score * 100).toFixed(0)}% — ${diffs.length} differing fields`,
        entityType: 'Product',
        entityId: a.product.id,
        fixAction: {
          type: 'compare_products',
          familyId,
          productIds: [a.product.id, b.product.id],
          skus: [a.product.sku, b.product.sku],
          score,
          differingFields: diffs,
        },
      });
    }
  }

  return findings;
}

export function productValueTokens(p: FlatProduct): Set<string> {
  const tokens = new Set<string>();
  for (const [code, raw] of Object.entries(p.values || {})) {
    const flat = flattenValue(raw);
    if (!flat) continue;
    tokens.add(`${code}:${clusterKey(flat)}`);
  }
  return tokens;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function differingFields(
  a: FlatProduct,
  b: FlatProduct,
): Array<{ code: string; a: string; b: string }> {
  const codes = new Set([...Object.keys(a.values || {}), ...Object.keys(b.values || {})]);
  const diffs: Array<{ code: string; a: string; b: string }> = [];
  for (const code of codes) {
    const av = flattenValue(a.values[code]);
    const bv = flattenValue(b.values[code]);
    if (clusterKey(av) === clusterKey(bv)) continue;
    if (!av && !bv) continue;
    diffs.push({ code, a: av, b: bv });
  }
  return diffs;
}

/** Apply string replacement mapping into a product values JSON blob (immutable-style). */
export function applyValueMapping(
  values: Record<string, unknown>,
  attributeCode: string,
  mapping: Record<string, string>,
): { next: Record<string, unknown>; changed: boolean; before: string; after: string } {
  const before = flattenValue(values[attributeCode]);
  if (!before || !mapping[before]) {
    return { next: values, changed: false, before, after: before };
  }
  const after = mapping[before];
  const next = { ...values };
  next[attributeCode] = rewriteValue(values[attributeCode], after);
  return { next, changed: true, before, after };
}

function rewriteValue(raw: unknown, newData: string): unknown {
  if (raw == null || typeof raw === 'string' || typeof raw === 'number') {
    return [{ locale: null, scope: null, data: newData }];
  }
  if (Array.isArray(raw)) {
    return raw.map((row) => {
      if (row && typeof row === 'object' && 'data' in (row as object)) {
        return { ...(row as object), data: newData };
      }
      return row;
    });
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, any>;
    if ('data' in obj) return { ...obj, data: newData };
    const out: Record<string, any> = {};
    for (const [ch, locales] of Object.entries(obj)) {
      if (locales && typeof locales === 'object') {
        out[ch] = {};
        for (const loc of Object.keys(locales as object)) {
          out[ch][loc] = newData;
        }
      } else {
        out[ch] = newData;
      }
    }
    return out;
  }
  return [{ locale: null, scope: null, data: newData }];
}
