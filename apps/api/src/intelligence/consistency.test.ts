import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findNearDuplicates,
  findVariantInconsistencies,
  jaccard,
  proposeCanonicalOptions,
  productValueTokens,
} from './consistency';

describe('jaccard / near-duplicates', () => {
  it('scores identical token sets as 1', () => {
    const a = new Set(['name:air', 'color:blue']);
    assert.equal(jaccard(a, new Set(a)), 1);
  });

  it('flags near-duplicate products in the same family', () => {
    const products = [
      {
        id: 'p1',
        sku: 'SKU-1',
        familyId: 'fam1',
        values: {
          name: 'Air Runner',
          color: 'Blue',
          material: 'Mesh',
          price: '100',
        },
      },
      {
        id: 'p2',
        sku: 'SKU-2',
        familyId: 'fam1',
        values: {
          name: 'Air Runner',
          color: 'Blue',
          material: 'Mesh',
          price: '100',
        },
      },
      {
        id: 'p3',
        sku: 'SKU-3',
        familyId: 'fam1',
        values: {
          name: 'Day Pack',
          color: 'Black',
          material: 'Nylon',
          price: '80',
        },
      },
    ];
    // p1/p2 share all tokens → score 1.0; p3 is distinct
    const findings = findNearDuplicates('fam1', 'apparel', products, 0.85);
    assert.ok(findings.some((f) => f.fixAction && (f.fixAction as any).productIds?.includes('p1')));
    assert.ok(findings.every((f) => f.category === 'near_duplicate'));
  });

  it('builds product tokens', () => {
    const tokens = productValueTokens({
      id: 'x',
      sku: 'x',
      familyId: 'f',
      values: { color: 'Blue' },
    });
    assert.ok(tokens.has('color:blue'));
  });
});

describe('variant inconsistencies', () => {
  it('detects casing/abbrev clusters for select-like text', () => {
    const finding = findVariantInconsistencies(
      'fam1',
      'apparel',
      { id: 'attr1', code: 'material', type: 'text' },
      [
        {
          id: 'p1',
          sku: 'A',
          familyId: 'fam1',
          values: { material: 'Stainless Steel' },
        },
        {
          id: 'p2',
          sku: 'B',
          familyId: 'fam1',
          values: { material: 'stainless steel' },
        },
        {
          id: 'p3',
          sku: 'C',
          familyId: 'fam1',
          values: { material: 'SS' },
        },
      ],
    );
    assert.ok(finding);
    assert.equal(finding!.category, 'consistency');
    assert.equal((finding!.fixAction as any).type, 'merge_to_canonical');
  });
});

describe('proposeCanonicalOptions', () => {
  it('groups freeform values into a mapping table', () => {
    const proposal = proposeCanonicalOptions(
      { id: 'a', code: 'color', type: 'select' },
      [
        { id: '1', sku: '1', familyId: 'f', values: { color: 'Blue' } },
        { id: '2', sku: '2', familyId: 'f', values: { color: 'blue' } },
        { id: '3', sku: '3', familyId: 'f', values: { color: 'Navy' } },
      ],
    );
    assert.ok(proposal.mapping.length >= 2);
    assert.ok(proposal.proposedOptions.includes('Navy'));
  });
});
