import { flattenValue } from './consistency';
import type { SelfCheckFailure } from './explanation';

export type AttributeForCheck = {
  code: string;
  type: string;
  validationRules?: unknown;
  /** Select/multiselect permitted values (LOV) */
  options?: unknown;
};

export type SelfCheckInput = {
  attribute: AttributeForCheck;
  suggestedValue: unknown;
  /** Current accepted product value for this attribute, if any */
  existingValue?: unknown;
  /** True when this suggestion is a Phase-2 conflict candidate */
  isConflictCandidate?: boolean;
  notFound?: boolean;
};

/**
 * Pre-review validation. Failures mark "Needs attention" — never drop the suggestion.
 * AttributeDependency rules are skipped until that model exists (Akeneo-parity).
 */
export function runSelfCheck(input: SelfCheckInput): SelfCheckFailure[] {
  const failures: SelfCheckFailure[] = [];
  if (input.notFound) return failures;

  const scalar = flattenValue(input.suggestedValue);
  const rules = (input.attribute.validationRules || {}) as Record<string, unknown>;
  const type = input.attribute.type;

  if (scalar === '' || scalar == null) {
    failures.push({
      rule: 'empty_value',
      message: 'Suggested value is empty',
    });
    return failures;
  }

  // Type checks
  if (type === 'number' || type === 'metric' || type === 'price') {
    const n = Number(String(scalar).replace(/[^0-9.+-]/g, ''));
    if (Number.isNaN(n)) {
      failures.push({
        rule: 'type_number',
        message: `Expected a numeric ${type} value, got "${scalar}"`,
      });
    } else {
      if (rules.min != null && n < Number(rules.min)) {
        failures.push({
          rule: 'min',
          message: `Value ${n} is below minimum ${rules.min}`,
        });
      }
      if (rules.max != null && n > Number(rules.max)) {
        failures.push({
          rule: 'max',
          message: `Value ${n} is above maximum ${rules.max}`,
        });
      }
    }
  }

  if (type === 'boolean') {
    const ok = ['true', 'false', '0', '1', 'yes', 'no'].includes(scalar.toLowerCase());
    if (!ok) {
      failures.push({
        rule: 'type_boolean',
        message: `Expected boolean, got "${scalar}"`,
      });
    }
  }

  if (type === 'date') {
    const d = Date.parse(scalar);
    if (Number.isNaN(d)) {
      failures.push({
        rule: 'type_date',
        message: `Expected a date, got "${scalar}"`,
      });
    }
  }

  if (typeof rules.regex === 'string' && rules.regex) {
    try {
      const re = new RegExp(rules.regex);
      if (!re.test(scalar)) {
        failures.push({
          rule: 'regex',
          message: `Value does not match required pattern /${rules.regex}/`,
        });
      }
    } catch {
      /* ignore invalid regex in rules */
    }
  }

  if (rules.minLength != null && scalar.length < Number(rules.minLength)) {
    failures.push({
      rule: 'minLength',
      message: `Value length ${scalar.length} is below minLength ${rules.minLength}`,
    });
  }
  if (rules.maxLength != null && scalar.length > Number(rules.maxLength)) {
    failures.push({
      rule: 'maxLength',
      message: `Value length ${scalar.length} exceeds maxLength ${rules.maxLength}`,
    });
  }

  // Conflict with an already-accepted product value (different from suggestion)
  const existing = flattenValue(input.existingValue);
  if (existing && existing.trim() && !input.isConflictCandidate) {
    const a = existing.trim().toLowerCase();
    const b = scalar.trim().toLowerCase();
    if (a !== b) {
      failures.push({
        rule: 'accepted_value_conflict',
        message: `Conflicts with existing accepted value "${existing}"`,
      });
    }
  }

  // LOV / select options — constrained vocabulary (Unilog-style)
  if (type === 'select' || type === 'multiselect') {
    const allowed = normalizeOptions(input.attribute.options);
    if (allowed.length) {
      const ok = allowed.some((o) => o.toLowerCase() === scalar.toLowerCase());
      if (!ok) {
        failures.push({
          rule: 'lov_not_allowed',
          message: `"${scalar}" is not in the approved list of values for ${input.attribute.code}`,
        });
      }
    }
  }

  // AttributeDependency: not implemented yet — intentionally skipped.

  return failures;
}

function normalizeOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object') {
        const row = o as { code?: string; label?: unknown };
        if (row.code) return String(row.code);
        if (typeof row.label === 'string') return row.label;
        if (row.label && typeof row.label === 'object' && 'en_US' in (row.label as object)) {
          return String((row.label as { en_US: string }).en_US);
        }
      }
      return '';
    })
    .filter(Boolean);
}
