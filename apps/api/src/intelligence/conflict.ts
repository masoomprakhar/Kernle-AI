import {
  mockExtractFromSources,
  type AttributeMeta,
  type ProposedValue,
} from './extract-logic';

export type SourceInput = {
  id: string;
  rawContent: string | null;
};

export type ConflictBundle = {
  attributeCode: string;
  /** All candidate proposals (length >= 2 when conflict) */
  candidates: ProposedValue[];
  conflictGroupId: string;
  isConflict: boolean;
};

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scalarFromProposal(p: ProposedValue): string | null {
  if (p.notFound || !p.suggestedValue) return null;
  const channel = Object.values(p.suggestedValue)[0];
  if (!channel) return null;
  const v = Object.values(channel)[0];
  return v == null ? null : String(v);
}

/**
 * Extract per source document, then for each attribute either:
 * - emit one proposal if all sources agree (or only one found a value), or
 * - emit ALL disagreeing candidates when sources conflict (never auto-pick).
 */
export function extractWithConflicts(
  attributeCodes: string[],
  attributes: AttributeMeta[],
  sources: SourceInput[],
  conflictGroupPrefix = 'cfg',
): ConflictBundle[] {
  if (!sources.length) {
    return attributeCodes.map((code) => ({
      attributeCode: code,
      candidates: mockExtractFromSources([code], attributes, '', undefined),
      conflictGroupId: `${conflictGroupPrefix}-${code}`,
      isConflict: false,
    }));
  }

  const perSource = sources.map((s) => ({
    sourceId: s.id,
    proposals: mockExtractFromSources(
      attributeCodes,
      attributes,
      s.rawContent || '',
      s.id,
    ),
  }));

  return attributeCodes.map((code) => {
    const found: ProposedValue[] = [];
    for (const src of perSource) {
      const p = src.proposals.find((x) => x.attributeCode === code);
      if (!p || p.notFound) continue;
      found.push(p);
    }

    const conflictGroupId = `${conflictGroupPrefix}-${code}-${Date.now().toString(36)}`;

    if (!found.length) {
      return {
        attributeCode: code,
        candidates: [
          {
            attributeCode: code,
            suggestedValue: null,
            confidence: 'none',
            confidenceScore: 0,
            notFound: true,
            reason: 'not_found_in_source',
            sourceDocumentId: sources[0]?.id,
          },
        ],
        conflictGroupId,
        isConflict: false,
      };
    }

    const unique = new Map<string, ProposedValue>();
    for (const p of found) {
      const key = normalizeComparable(scalarFromProposal(p) || '');
      if (!unique.has(key)) unique.set(key, p);
    }

    if (unique.size === 1) {
      const only = [...unique.values()][0];
      return {
        attributeCode: code,
        candidates: [only],
        conflictGroupId,
        isConflict: false,
      };
    }

    // Conflict: surface every distinct candidate; human must choose.
    const candidates = [...unique.values()].map((p) => ({
      ...p,
      confidence: 'medium' as const,
      confidenceScore: 0.5,
      reason: `Conflict: sources disagree — candidate from source (${p.excerpt || scalarFromProposal(p)})`,
    }));

    return {
      attributeCode: code,
      candidates,
      conflictGroupId,
      isConflict: true,
    };
  });
}

export { normalizeComparable, scalarFromProposal };
