const PLACEHOLDER_RE =
  /^\s*(--\s*)?(unbranded|no unilog brand|no dib brand)(\s*--)?\s*$/i;

export function isPlaceholderBrand(value: string | null | undefined): boolean {
  if (value == null) return true;
  const v = String(value).trim();
  if (!v) return true;
  return PLACEHOLDER_RE.test(v);
}

export function cleanBrandCandidates(...values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (!s || isPlaceholderBrand(s)) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}
