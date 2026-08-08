import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributeCodesTiedToSource,
  estimateExtractionJobUnits,
  scopeAttributeCodes,
} from './incremental';

describe('incremental reprocessing', () => {
  it('collects attribute codes tied to a source document', () => {
    const codes = attributeCodesTiedToSource(
      [
        {
          attributeCode: 'color',
          sourceDocumentId: 'src-a',
          status: 'pending',
        },
        {
          attributeCode: 'material',
          sourceDocumentId: 'src-b',
          status: 'accepted',
        },
        {
          attributeCode: 'name',
          sourceDocumentId: 'src-c',
          status: 'pending',
          explanation: { sourceDocumentIds: ['src-a', 'src-c'] },
        },
      ],
      'src-a',
    );
    assert.deepEqual(codes, ['color', 'name']);
  });

  it('scopes attribute codes and reports skipped', () => {
    const { toProcess, skipped } = scopeAttributeCodes(
      ['name', 'color', 'material', 'price'],
      ['color', 'price'],
    );
    assert.deepEqual(toProcess.sort(), ['color', 'price']);
    assert.deepEqual(skipped.sort(), ['material', 'name']);
  });

  it('estimates fewer job units for incremental vs full re-run', () => {
    const all = ['name', 'color', 'material', 'price', 'description'];
    const full = estimateExtractionJobUnits({
      attributeCodes: all,
      sourceCount: 2,
    });
    const incremental = estimateExtractionJobUnits({
      attributeCodes: all,
      onlyAttributeCodes: ['color'],
      sourceCount: 1,
    });
    assert.equal(full.units, 10);
    assert.equal(incremental.units, 1);
    assert.equal(incremental.skippedAttributes, 4);
    assert.ok(incremental.units < full.units);
  });
});
