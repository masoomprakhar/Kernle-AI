/**
 * Incremental reprocessing helpers (Phase 4).
 * Scope work to affected SourceDocuments / attributes / families.
 */

export type SuggestionRef = {
  attributeCode: string | null;
  sourceDocumentId: string | null;
  status: string;
  explanation?: unknown;
};

/**
 * Attribute codes previously proposed from a given SourceDocument.
 * Used to re-run extraction only for those attributes when the source changes.
 */
export function attributeCodesTiedToSource(
  suggestions: SuggestionRef[],
  sourceDocumentId: string,
): string[] {
  const codes = new Set<string>();
  for (const s of suggestions) {
    if (!s.attributeCode) continue;
    if (s.sourceDocumentId === sourceDocumentId) {
      codes.add(s.attributeCode);
      continue;
    }
    const exp = s.explanation as { sourceDocumentIds?: string[] } | null;
    if (exp?.sourceDocumentIds?.includes(sourceDocumentId)) {
      codes.add(s.attributeCode);
    }
  }
  return [...codes].sort();
}

/**
 * Given a requested attribute scope, return codes that should be processed.
 * If scope is empty/undefined, process all candidates (full re-run).
 */
export function scopeAttributeCodes(
  candidateCodes: string[],
  onlyAttributeCodes?: string[] | null,
): { toProcess: string[]; skipped: string[] } {
  if (!onlyAttributeCodes?.length) {
    return { toProcess: [...candidateCodes], skipped: [] };
  }
  const allow = new Set(onlyAttributeCodes);
  const toProcess = candidateCodes.filter((c) => allow.has(c));
  const skipped = candidateCodes.filter((c) => !allow.has(c));
  return { toProcess, skipped };
}

/**
 * Estimate job units for incremental vs full reprocess (for tests / metrics).
 * One unit ≈ one attribute extraction attempt.
 */
export function estimateExtractionJobUnits(opts: {
  attributeCodes: string[];
  onlyAttributeCodes?: string[] | null;
  sourceCount: number;
}): { units: number; skippedAttributes: number } {
  const { toProcess, skipped } = scopeAttributeCodes(
    opts.attributeCodes,
    opts.onlyAttributeCodes,
  );
  return {
    units: toProcess.length * Math.max(1, opts.sourceCount),
    skippedAttributes: skipped.length,
  };
}
