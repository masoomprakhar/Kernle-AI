export type AttributeMeta = {
  code: string;
  type?: string;
  label?: unknown;
};

export type ExistingSuggestion = {
  attributeCode: string | null;
  status: string;
  confidenceScore: number | null;
};

export type ProductValueMap = Record<string, unknown>;

export type ProposedValue = {
  attributeCode: string;
  /** Scoped value shape used by PIM, or null when not found */
  suggestedValue: Record<string, Record<string, string>> | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  confidenceScore: number;
  notFound: boolean;
  reason: string;
  excerpt?: string;
  sourceDocumentId?: string;
};

const LOW_CONFIDENCE = 0.55;

function labelText(label: unknown, code: string): string {
  if (label && typeof label === 'object') {
    const map = label as Record<string, string>;
    return map.en_US || map.en || Object.values(map)[0] || code;
  }
  return code;
}

function isFilledValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const obj = value as Record<string, any>;
    if ('data' in obj) return isFilledValue(obj.data);
    for (const channel of Object.values(obj)) {
      if (channel && typeof channel === 'object') {
        for (const v of Object.values(channel as object)) {
          if (isFilledValue(v)) return true;
        }
      } else if (isFilledValue(channel)) return true;
    }
  }
  return false;
}

/**
 * Attributes eligible for (re)proposal:
 * - skip if product already has an accepted/filled value
 * - skip if a pending suggestion already exists with confidence above low threshold
 * - allow re-propose when pending is low-confidence or missing
 */
export function attributesForExtraction(
  attributes: AttributeMeta[],
  productValues: ProductValueMap,
  existingSuggestions: ExistingSuggestion[],
  lowConfidenceThreshold = LOW_CONFIDENCE,
): string[] {
  const acceptedOrPendingStrong = new Set<string>();
  const pendingLow = new Set<string>();

  for (const s of existingSuggestions) {
    if (!s.attributeCode) continue;
    if (s.status === 'accepted') {
      acceptedOrPendingStrong.add(s.attributeCode);
      continue;
    }
    if (s.status === 'pending') {
      const score = s.confidenceScore ?? 0;
      if (score >= lowConfidenceThreshold) {
        acceptedOrPendingStrong.add(s.attributeCode);
      } else {
        pendingLow.add(s.attributeCode);
      }
    }
  }

  return attributes
    .map((a) => a.code)
    .filter((code) => {
      if (isFilledValue(productValues[code])) return false;
      if (acceptedOrPendingStrong.has(code)) return false;
      return true;
    });
}

function scoped(value: string): Record<string, Record<string, string>> {
  return { '<all_channels>': { '<all_locales>': value } };
}

function findLabeledValue(text: string, labels: string[]): { value: string; excerpt: string } | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\-]\\s*([^\\n\\r|;]+)`,
      'i',
    );
    const m = text.match(re);
    if (m?.[1]) {
      const value = m[1].trim().replace(/\s+/g, ' ');
      if (value) {
        return { value, excerpt: m[0].trim().slice(0, 200) };
      }
    }
  }
  return null;
}

/**
 * Deterministic mock extraction from combined source text.
 * Never invents values — returns notFound when no pattern matches.
 */
export function mockExtractFromSources(
  attributeCodes: string[],
  attributes: AttributeMeta[],
  combinedText: string,
  primarySourceDocumentId?: string,
): ProposedValue[] {
  const byCode = new Map(attributes.map((a) => [a.code, a]));
  const text = combinedText || '';

  return attributeCodes.map((code) => {
    const attr = byCode.get(code);
    const human = labelText(attr?.label, code);
    const labels = [human, code, code.replace(/_/g, ' ')];

    // Prefer structured "Label: value" lines
    const hit = findLabeledValue(text, labels);
    if (hit) {
      return {
        attributeCode: code,
        suggestedValue: scoped(hit.value),
        confidence: 'high',
        confidenceScore: 0.88,
        notFound: false,
        reason: `Extracted from source: "${hit.excerpt}"`,
        excerpt: hit.excerpt,
        sourceDocumentId: primarySourceDocumentId,
      };
    }

    // Name / title heuristics
    if (code === 'name' || code === 'title') {
      const titleLine = text
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 3 && l.length < 120 && !l.includes(':'));
      if (titleLine) {
        return {
          attributeCode: code,
          suggestedValue: scoped(titleLine),
          confidence: 'medium',
          confidenceScore: 0.7,
          notFound: false,
          reason: 'Inferred product name from leading source line',
          excerpt: titleLine,
          sourceDocumentId: primarySourceDocumentId,
        };
      }
    }

    if (code === 'description' || code === 'long_description') {
      const paras = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 40);
      if (paras[0]) {
        const excerpt = paras[0].slice(0, 280);
        return {
          attributeCode: code,
          suggestedValue: scoped(excerpt),
          confidence: 'medium',
          confidenceScore: 0.62,
          notFound: false,
          reason: 'Took first substantive paragraph from source',
          excerpt: excerpt.slice(0, 160),
          sourceDocumentId: primarySourceDocumentId,
        };
      }
    }

    // Honest blank
    return {
      attributeCode: code,
      suggestedValue: null,
      confidence: 'none',
      confidenceScore: 0,
      notFound: true,
      reason: 'not_found_in_source',
      excerpt: undefined,
      sourceDocumentId: primarySourceDocumentId,
    };
  });
}

export { LOW_CONFIDENCE, isFilledValue };
