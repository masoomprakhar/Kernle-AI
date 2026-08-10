import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBrand, type BrandMasterRow } from './brand-resolve';

const master: BrandMasterRow[] = [
  {
    brandName: 'Moen',
    brandCode: 'MOEN',
    manufacturerName: 'Moen Incorporated',
    manufacturerCode: 'MOEN',
    aliases: ['MOEN', 'Moen Inc', 'MOEN INC'],
  },
  {
    brandName: 'Delta',
    brandCode: 'DELTA',
    manufacturerName: 'Delta Faucet Company',
    manufacturerCode: 'DELTA',
    aliases: ['DELTA', 'Delta Faucet'],
  },
];

describe('resolveBrand', () => {
  it('maps alias spelling to canonical brand', () => {
    const hit = resolveBrand(master, 'MOEN INC');
    assert.ok(hit);
    assert.equal(hit!.brandName, 'Moen');
    assert.equal(hit!.manufacturerName, 'Moen Incorporated');
  });

  it('ignores placeholder brands', () => {
    const hit = resolveBrand(master, '-- Unbranded --', 'DELTA');
    assert.ok(hit);
    assert.equal(hit!.brandName, 'Delta');
  });

  it('returns null when nothing matches', () => {
    assert.equal(resolveBrand(master, '-- Unbranded --'), null);
  });
});
