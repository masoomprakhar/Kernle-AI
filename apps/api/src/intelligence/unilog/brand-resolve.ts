import { cleanBrandCandidates } from './placeholders';

export type BrandMasterRow = {
  manufacturerName: string;
  manufacturerCode: string;
  brandName: string;
  brandCode: string;
  aliases: string[];
};

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveBrand(
  master: BrandMasterRow[],
  ...rawCandidates: Array<string | null | undefined>
): { brandName: string; manufacturerName: string; matchedAlias: string; confidence: number } | null {
  const candidates = cleanBrandCandidates(...rawCandidates);
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    const n = norm(candidate);
    for (const row of master) {
      const aliases = [row.brandName, row.brandCode, row.manufacturerName, row.manufacturerCode, ...row.aliases];
      for (const alias of aliases) {
        if (norm(alias) === n) {
          return {
            brandName: row.brandName,
            manufacturerName: row.manufacturerName,
            matchedAlias: candidate,
            confidence: 0.95,
          };
        }
      }
    }
  }

  // Fuzzy contains match
  for (const candidate of candidates) {
    const n = norm(candidate);
    for (const row of master) {
      const aliases = [row.brandName, row.brandCode, row.manufacturerName, ...row.aliases];
      for (const alias of aliases) {
        const a = norm(alias);
        if (a.length >= 3 && (n.includes(a) || a.includes(n))) {
          return {
            brandName: row.brandName,
            manufacturerName: row.manufacturerName,
            matchedAlias: candidate,
            confidence: 0.75,
          };
        }
      }
    }
  }

  return null;
}
