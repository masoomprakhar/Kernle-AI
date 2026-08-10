export type UomRules = {
  approvedAbbreviations: Record<string, string>;
  fractionDecimal: Array<{ fraction: string; decimal: number }>;
};

function approxEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

export function decimalToFraction(decimal: number, rules: UomRules): string | null {
  const whole = Math.floor(decimal + 1e-9);
  const fracPart = decimal - whole;
  if (approxEqual(fracPart, 0)) return whole ? String(whole) : null;

  let best: { fraction: string; err: number } | null = null;
  for (const row of rules.fractionDecimal) {
    const err = Math.abs(row.decimal - fracPart);
    if (!best || err < best.err) best = { fraction: row.fraction, err };
  }
  if (!best || best.err > 0.02) return null;
  if (whole === 0) return best.fraction;
  if (best.fraction === '1') return String(whole + 1);
  return `${whole}-${best.fraction}`;
}

/** Normalize size-like strings: "24in", "0.5 IN.", "50.25 inches" → approved form with space. */
export function normalizeSizeUom(raw: string, rules: UomRules): string {
  let s = String(raw || '').trim();
  if (!s) return s;

  // "3/4X1/2" style — leave structure, normalize unit suffixes later
  s = s.replace(/(\d)\s*[xX]\s*(\d)/g, '$1 x $2');

  // Split number + unit glued: 24in, 1.5GPM, 150#
  const glued = s.match(/^(\d+(?:\.\d+)?(?:\s*-\s*\d+\/\d+|\s+\d+\/\d+|\/\d+)?)\s*([a-zA-Z.#"]+)$/);
  if (glued) {
    const num = glued[1].replace(/\s+/g, ' ').trim();
    let unit = glued[2];
    const abbr = rules.approvedAbbreviations[unit] || rules.approvedAbbreviations[unit.toLowerCase()];
    if (abbr) unit = abbr;
    else if (unit === '#') unit = '#';
    // Convert decimal inches to fraction when unit is in
    const n = Number(num);
    if (!Number.isNaN(n) && (unit === 'in' || unit === '"')) {
      const frac = decimalToFraction(n, rules);
      if (frac) return `${frac} in`;
    }
    return unit === '#' ? `${num}#` : `${num} ${unit}`;
  }

  // Standalone decimal that looks like inches in context
  if (/^\d+\.\d+$/.test(s)) {
    const frac = decimalToFraction(Number(s), rules);
    if (frac) return `${frac} in`;
  }

  // Replace known unit tokens
  for (const [from, to] of Object.entries(rules.approvedAbbreviations)) {
    const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    s = s.replace(re, to);
  }

  // Ensure space before unit words
  s = s.replace(/(\d)(in|ft|mm|gal|gpm|psi|dBA)\b/gi, '$1 $2');
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeGpm(raw: string): string | null {
  const m = String(raw).match(/(\d+(?:\.\d+)?)\s*gpm/i);
  if (!m) return null;
  return `${m[1]} gpm`;
}
