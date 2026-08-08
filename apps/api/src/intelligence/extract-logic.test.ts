import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributesForExtraction,
  mockExtractFromSources,
} from './extract-logic';

const attrs = [
  { code: 'name', label: { en_US: 'Name' } },
  { code: 'color', label: { en_US: 'Color' } },
  { code: 'material', label: { en_US: 'Material' } },
  { code: 'price', label: { en_US: 'Price' } },
];

describe('attributesForExtraction', () => {
  it('skips filled product values and accepted suggestions', () => {
    const codes = attributesForExtraction(
      attrs,
      { name: { '<all_channels>': { '<all_locales>': 'Kept Name' } } },
      [
        { attributeCode: 'color', status: 'accepted', confidenceScore: 0.9 },
        { attributeCode: 'material', status: 'pending', confidenceScore: 0.8 },
        { attributeCode: 'price', status: 'pending', confidenceScore: 0.2 },
      ],
    );
    assert.deepEqual(codes.sort(), ['price']);
  });

  it('allows re-propose for low-confidence pending only', () => {
    const codes = attributesForExtraction(
      attrs,
      {},
      [{ attributeCode: 'name', status: 'pending', confidenceScore: 0.3 }],
    );
    assert.ok(codes.includes('name'));
    assert.ok(codes.includes('color'));
  });

  it('does not clobber accepted values on partial re-run', () => {
    const codes = attributesForExtraction(
      attrs,
      {},
      [
        { attributeCode: 'name', status: 'accepted', confidenceScore: 0.95 },
        { attributeCode: 'color', status: 'rejected', confidenceScore: 0.4 },
      ],
    );
    assert.ok(!codes.includes('name'));
    assert.ok(codes.includes('color'));
  });
});

describe('mockExtractFromSources', () => {
  it('extracts labeled values and leaves unknowns blank', () => {
    const text = 'Name: Air Runner\nColor: Blue\n';
    const proposals = mockExtractFromSources(
      ['name', 'color', 'material'],
      attrs,
      text,
      'src1',
    );
    const byCode = Object.fromEntries(proposals.map((p) => [p.attributeCode, p]));
    assert.equal(byCode.name.notFound, false);
    assert.equal(
      byCode.name.suggestedValue?.['<all_channels>']?.['<all_locales>'],
      'Air Runner',
    );
    assert.equal(byCode.material.notFound, true);
    assert.equal(byCode.material.reason, 'not_found_in_source');
    assert.equal(byCode.material.suggestedValue, null);
  });
});
