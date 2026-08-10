import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSelfCheck } from './self-check';

describe('runSelfCheck', () => {
  it('flags non-numeric values for number attributes', () => {
    const failures = runSelfCheck({
      attribute: { code: 'price', type: 'number' },
      suggestedValue: { '<all_channels>': { '<all_locales>': 'not-a-number' } },
    });
    assert.ok(failures.some((f) => f.rule === 'type_number'));
  });

  it('flags min/max validation failures', () => {
    const failures = runSelfCheck({
      attribute: {
        code: 'price',
        type: 'number',
        validationRules: { min: 10, max: 100 },
      },
      suggestedValue: { '<all_channels>': { '<all_locales>': '5' } },
    });
    assert.ok(failures.some((f) => f.rule === 'min'));
  });

  it('flags regex validation failures', () => {
    const failures = runSelfCheck({
      attribute: {
        code: 'sku_ref',
        type: 'text',
        validationRules: { regex: '^[A-Z]{2}-\\d+$' },
      },
      suggestedValue: { '<all_channels>': { '<all_locales>': 'bad' } },
    });
    assert.ok(failures.some((f) => f.rule === 'regex'));
  });

  it('flags conflict with existing accepted value', () => {
    const failures = runSelfCheck({
      attribute: { code: 'color', type: 'text' },
      suggestedValue: { '<all_channels>': { '<all_locales>': 'Navy' } },
      existingValue: { '<all_channels>': { '<all_locales>': 'Blue' } },
    });
    assert.ok(failures.some((f) => f.rule === 'accepted_value_conflict'));
  });

  it('does not flag accepted_value_conflict for conflict candidates', () => {
    const failures = runSelfCheck({
      attribute: { code: 'color', type: 'text' },
      suggestedValue: { '<all_channels>': { '<all_locales>': 'Navy' } },
      existingValue: { '<all_channels>': { '<all_locales>': 'Blue' } },
      isConflictCandidate: true,
    });
    assert.ok(!failures.some((f) => f.rule === 'accepted_value_conflict'));
  });

  it('skips checks for not_found suggestions', () => {
    const failures = runSelfCheck({
      attribute: { code: 'color', type: 'text' },
      suggestedValue: { not_found_in_source: true },
      notFound: true,
    });
    assert.equal(failures.length, 0);
  });

  it('flags select values outside LOV options', () => {
    const failures = runSelfCheck({
      attribute: {
        code: 'finish',
        type: 'select',
        options: [
          { code: 'Chrome', label: { en_US: 'Chrome' } },
          { code: 'Brushed Nickel', label: { en_US: 'Brushed Nickel' } },
        ],
      },
      suggestedValue: { '<all_channels>': { '<all_locales>': 'Hot Pink' } },
    });
    assert.ok(failures.some((f) => f.rule === 'lov_not_allowed'));
  });

  it('allows select values in LOV options', () => {
    const failures = runSelfCheck({
      attribute: {
        code: 'finish',
        type: 'select',
        options: ['Chrome', 'Brushed Nickel'],
      },
      suggestedValue: { '<all_channels>': { '<all_locales>': 'Chrome' } },
    });
    assert.ok(!failures.some((f) => f.rule === 'lov_not_allowed'));
  });
});
