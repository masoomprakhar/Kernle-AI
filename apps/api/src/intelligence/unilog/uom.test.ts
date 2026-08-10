import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSizeUom, decimalToFraction, type UomRules } from './uom';

const rules: UomRules = {
  approvedAbbreviations: {
    inch: 'in',
    inches: 'in',
    'in.': 'in',
    IN: 'in',
    'IN.': 'in',
    '"': 'in',
    gpm: 'gpm',
    GPM: 'gpm',
  },
  fractionDecimal: [
    { fraction: '1/4', decimal: 0.25 },
    { fraction: '1/2', decimal: 0.5 },
    { fraction: '3/4', decimal: 0.75 },
  ],
};

describe('uom normalize', () => {
  it('maps decimal half to fraction with space before unit', () => {
    assert.equal(normalizeSizeUom('0.5', rules), '1/2 in');
    assert.equal(normalizeSizeUom('0.5 in', rules), '1/2 in');
  });

  it('normalizes inch variants', () => {
    assert.equal(normalizeSizeUom('24in', rules), '24 in');
    assert.match(normalizeSizeUom('24 IN.', rules), /24\s+in/i);
  });

  it('decimalToFraction uses map', () => {
    assert.equal(decimalToFraction(0.5, rules), '1/2');
    assert.equal(decimalToFraction(0.25, rules), '1/4');
  });
});
