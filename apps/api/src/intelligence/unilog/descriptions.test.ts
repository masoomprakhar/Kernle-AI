import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDescriptions, checkDescLimits } from './descriptions';

describe('descriptions', () => {
  it('builds invoice/mobile/title/long within limits', () => {
    const d = buildDescriptions({
      brand: 'Moen',
      manufacturer: 'Moen Incorporated',
      mpn: '7594SRS',
      itemType: 'Kitchen Faucet',
      keyAttrs: ['Spot Resist Stainless', 'Pull-Down'],
      finishOrMaterial: 'Spot Resist Stainless',
    });
    assert.ok(d.invoice_desc.length <= 40);
    assert.ok(d.mobile_desc.length <= 80);
    assert.ok(d.mobile_desc.length >= 60);
    assert.ok(d.product_title.length <= 180);
    assert.ok(d.long_description.length > 40);
    const checks = checkDescLimits(d);
    assert.ok(checks.every((c) => c.ok));
  });
});
