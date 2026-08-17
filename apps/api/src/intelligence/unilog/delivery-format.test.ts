import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadUnilogPack } from './load-data';
import { enrichToDeliveryFormat } from './extract';
import { exportDeliveryFormatCsv } from './export-csv';
import { dedupeItems } from './dedupe';
import { cleanBrandCandidates } from './placeholders';
import { emptyDeliveryFormatRow } from './delivery-format-types';

describe('delivery format pipeline', () => {
  const pack = loadUnilogPack();

  it('freezes exactly 252 Expected Output headers', () => {
    assert.equal(pack.deliveryFormatHeaders.length, 252);
    assert.equal(pack.deliveryFormatHeaders[0], 'MFR URL');
    assert.equal(pack.deliveryFormatHeaders[251], 'Actual Image (Yes/No)');
  });

  it('builds a full row with all headers present', () => {
    const result = enrichToDeliveryFormat({
      partDesc: '3M 775L Stikit Film P150 - Cubitron II 50 Disc/Box',
      mpn: '3MABR-7100075678',
      brandHints: cleanBrandCandidates('3M', '-- Unbranded --'),
      familyHint: 'abrasive',
      brandMaster: pack.brandMaster,
      uomRules: pack.uomRules,
      lov: pack.lov,
      headers: pack.deliveryFormatHeaders,
      taxonomy: pack.taxonomy,
      e1Brand: '-- Unbranded --',
      unilogBrand: '-- No Unilog Brand --',
      dibBrand: '-- No DIB Brand --',
      partManuf: 'Jam Industrial Supply LLC (JAMIN)',
      sku: 'UNI-S0002',
    });
    assert.equal(Object.keys(result.deliveryFormat).length, 252);
    assert.equal(result.deliveryFormat['MANUFACTURER_PART_NUMBER'], '3MABR-7100075678');
    assert.ok(result.deliveryFormat['Classpath'].includes('Abrasives'));
    assert.ok(result.attributes.some((a) => a.label === 'Grit' && a.value === 'P150'));
    assert.ok(result.deliveryFormat['INVOICE_DESC'].length <= 40);
  });

  it('exports CSV with frozen header line', () => {
    const empty = emptyDeliveryFormatRow(pack.deliveryFormatHeaders);
    empty['Mfg_Part_Num'] = 'TEST';
    const csv = exportDeliveryFormatCsv(pack.deliveryFormatHeaders, [empty]);
    const headerLine = csv.split('\n')[0];
    assert.equal(headerLine.split(',').length, 252);
    assert.ok(headerLine.startsWith('MFR URL,'));
  });

  it('dedupes exact MPN matches', () => {
    const result = dedupeItems([
      { id: 'a', mpn: 'ABC-1', partDesc: 'foo bar' },
      { id: 'b', mpn: 'ABC-1', partDesc: 'foo bar baz' },
      { id: 'c', mpn: 'XYZ', partDesc: 'other' },
    ]);
    assert.equal(result.groups.length, 1);
    assert.deepEqual(result.groups[0].duplicateIds, ['b']);
  });

  it('applies golden dishwasher overrides for PDSH4816AF', () => {
    assert.ok(pack.goldenGt);
    const golden = pack.goldenGt!;
    const result = enrichToDeliveryFormat({
      partDesc: golden.deliveryFormat['Part_Desc'],
      mpn: golden.mpn,
      brandHints: cleanBrandCandidates(
        golden.deliveryFormat['BRAND_NAME'],
        golden.deliveryFormat['Part_Manuf'],
      ),
      familyHint: 'dishwasher',
      brandMaster: pack.brandMaster,
      uomRules: pack.uomRules,
      lov: pack.lov,
      headers: pack.deliveryFormatHeaders,
      taxonomy: pack.taxonomy,
      goldenOverrides: golden.deliveryFormat,
      mfrUrl: golden.deliveryFormat['MFR URL'],
    });
    assert.equal(result.deliveryFormat['BRAND_NAME'], golden.deliveryFormat['BRAND_NAME']);
    assert.equal(result.deliveryFormat['Classpath'], golden.deliveryFormat['Classpath']);
    assert.ok(result.deliveryFormat['SHORT_DESC'].includes('FRIGIDAIRE'));
  });

  it('loads 1000 sample items', () => {
    assert.equal(pack.sampleItems.length, 1000);
  });
});
