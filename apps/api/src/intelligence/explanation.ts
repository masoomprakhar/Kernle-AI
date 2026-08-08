/**
 * Shared explainability schema for AiSuggestion.explanation (Phase 3).
 * Additive JSON on the existing suggestion model — do not fork a parallel table.
 */

export type ExplanationType =
  | 'source_extract'
  | 'source_conflict'
  | 'inferred_family'
  | 'fill_stub'
  | 'image_tag'
  | 'not_found';

export type SelfCheckFailure = {
  rule: string;
  message: string;
};

export type SuggestionExplanation = {
  schemaVersion: 1;
  explanationType: ExplanationType;
  reason: string;
  excerpt?: string | null;
  sourceDocumentIds?: string[];
  /** Human-readable origin, e.g. "spec sheet PDF" or "similar products in family apparel" */
  originLabel?: string;
  notFound?: boolean;
  conflict?: boolean;
  conflictGroupId?: string | null;
  requiresHumanChoice?: boolean;
  needsAttention?: boolean;
  selfCheckFailures?: SelfCheckFailure[];
  /** Set when reviewer resolves the suggestion */
  resolution?: {
    outcome: 'accepted_as_is' | 'edited_accept' | 'rejected';
    editedValue?: unknown;
    resolvedAt?: string;
  };
};

export function buildExplanation(
  partial: Omit<SuggestionExplanation, 'schemaVersion'> & { schemaVersion?: 1 },
): SuggestionExplanation {
  return {
    schemaVersion: 1,
    needsAttention: Boolean(partial.needsAttention || partial.selfCheckFailures?.length),
    ...partial,
  };
}

export function explanationTypeLabel(type: ExplanationType): string {
  switch (type) {
    case 'source_extract':
      return 'from source documents';
    case 'source_conflict':
      return 'source conflict';
    case 'inferred_family':
      return 'inferred from similar products';
    case 'fill_stub':
      return 'attribute fill draft';
    case 'image_tag':
      return 'from image';
    case 'not_found':
      return 'not found in source';
    default:
      return type;
  }
}

/** Group suggestions for batch triage by trust / explanation type. */
export function groupByExplanationType<T extends { explanation?: unknown }>(
  rows: T[],
): Record<string, T[]> {
  const groups: Record<string, T[]> = {
    source_extract: [],
    source_conflict: [],
    inferred_family: [],
    fill_stub: [],
    image_tag: [],
    not_found: [],
    needs_attention: [],
    other: [],
  };

  for (const row of rows) {
    const exp = row.explanation as SuggestionExplanation | null | undefined;
    if (exp?.needsAttention || (exp?.selfCheckFailures && exp.selfCheckFailures.length)) {
      groups.needs_attention.push(row);
      continue;
    }
    const key = exp?.explanationType || 'other';
    if (groups[key]) groups[key].push(row);
    else groups.other.push(row);
  }

  return groups;
}

export function summarizeGroups(groups: Record<string, unknown[]>): Array<{ key: string; count: number; label: string }> {
  return Object.entries(groups)
    .filter(([, rows]) => rows.length > 0)
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      label:
        key === 'needs_attention'
          ? 'needs attention'
          : explanationTypeLabel(key as ExplanationType),
    }))
    .sort((a, b) => b.count - a.count);
}
