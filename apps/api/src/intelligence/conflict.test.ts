import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractWithConflicts } from './conflict';

const attrs = [
  { code: 'color', label: { en_US: 'Color' } },
  { code: 'name', label: { en_US: 'Name' } },
];

describe('extractWithConflicts', () => {
  it('surfaces both candidates when sources disagree — neither auto-picked', () => {
    const bundles = extractWithConflicts(
      ['color'],
      attrs,
      [
        { id: 'src-a', rawContent: 'Name: Shoe\nColor: Blue' },
        { id: 'src-b', rawContent: 'Name: Shoe\nColor: Navy' },
      ],
      'test',
    );
    const color = bundles.find((b) => b.attributeCode === 'color');
    assert.ok(color);
    assert.equal(color!.isConflict, true);
    assert.equal(color!.candidates.length, 2);
    const values = color!.candidates.map(
      (c) => c.suggestedValue?.['<all_channels>']?.['<all_locales>'],
    );
    assert.ok(values.includes('Blue'));
    assert.ok(values.includes('Navy'));
  });

  it('emits a single proposal when sources agree', () => {
    const bundles = extractWithConflicts(
      ['color'],
      attrs,
      [
        { id: 'src-a', rawContent: 'Color: Ember' },
        { id: 'src-b', rawContent: 'Color: Ember' },
      ],
    );
    const color = bundles.find((b) => b.attributeCode === 'color');
    assert.equal(color!.isConflict, false);
    assert.equal(color!.candidates.length, 1);
    assert.equal(
      color!.candidates[0].suggestedValue?.['<all_channels>']?.['<all_locales>'],
      'Ember',
    );
  });
});
