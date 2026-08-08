import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExplanation, groupByExplanationType, summarizeGroups } from './explanation';

describe('explanation helpers', () => {
  it('sets needsAttention when self-check failures exist', () => {
    const exp = buildExplanation({
      explanationType: 'fill_stub',
      reason: 'draft',
      selfCheckFailures: [{ rule: 'min', message: 'too small' }],
    });
    assert.equal(exp.schemaVersion, 1);
    assert.equal(exp.needsAttention, true);
  });

  it('groups needs_attention ahead of explanation type', () => {
    const groups = groupByExplanationType([
      {
        explanation: buildExplanation({
          explanationType: 'source_extract',
          reason: 'ok',
          needsAttention: true,
          selfCheckFailures: [{ rule: 'regex', message: 'bad' }],
        }),
      },
      {
        explanation: buildExplanation({
          explanationType: 'inferred_family',
          reason: 'peer',
        }),
      },
    ]);
    assert.equal(groups.needs_attention.length, 1);
    assert.equal(groups.inferred_family.length, 1);
    const summary = summarizeGroups(groups);
    assert.ok(summary.some((s) => s.key === 'needs_attention' && s.count === 1));
  });
});
