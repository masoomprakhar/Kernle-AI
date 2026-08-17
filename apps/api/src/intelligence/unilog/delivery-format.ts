import type { DeliveryFormatRow } from './delivery-format-types';
import { emptyDeliveryFormatRow } from './delivery-format-types';
import type { DescFields } from './descriptions';

export type DeliveryAttribute = {
  label: string;
  value: string;
  uom?: string;
};

export type DeliveryFormatInput = {
  headers: readonly string[];
  /** Raw input passthrough */
  mfgPartNum: string;
  partDesc: string;
  e1Brand: string;
  unilogBrand: string;
  dibBrand: string;
  partManuf: string;
  /** Resolved */
  manufacturerName: string;
  brandName: string;
  tradeName?: string;
  mpn: string;
  alternatePartNumber?: string;
  classpath: string;
  dept: string;
  className: string;
  fine: string;
  sku?: string;
  partNumber?: string;
  descriptions: DescFields;
  attributes: DeliveryAttribute[];
  mfrUrl?: string;
  unspsc?: string;
  countryOfOrigin?: string;
  warranty?: string;
  productImage?: string;
  actualImage?: string;
  standardApprovals?: string;
  application?: string;
  includes?: string;
  prop65?: string;
};

/** Map enrichment result → all 252 columns (empty string for unknown). */
export function buildDeliveryFormatRow(input: DeliveryFormatInput): DeliveryFormatRow {
  const row = emptyDeliveryFormatRow(input.headers);
  const d = input.descriptions;

  row['MFR URL'] = input.mfrUrl || '';
  row['PART_NUMBER'] = input.partNumber || '';
  row['Dept'] = input.dept || '';
  row['Class'] = input.className || '';
  row['Fine'] = input.fine || '';
  row['SKU - MY_PART_NUMBER'] = input.sku || '';
  row['Mfg_Part_Num'] = input.mfgPartNum || '';
  row['Part_Desc'] = input.partDesc || '';
  row['E1_Brand'] = input.e1Brand || '';
  row['Unilog_Brand'] = input.unilogBrand || '';
  row['DIB_Brand'] = input.dibBrand || '';
  row['Part_Manuf'] = input.partManuf || '';
  row['MANUFACTURER_NAME'] = input.manufacturerName || '';
  row['BRAND_NAME'] = input.brandName || '';
  row['TRADE_NAME'] = input.tradeName || '';
  row['MANUFACTURER_PART_NUMBER'] = input.mpn || '';
  row['ALTERNATE_PART_NUMBER'] = input.alternatePartNumber || '';
  row['Classpath'] = input.classpath || '';
  row['MOBILE_DESC'] = d.mobile_desc || '';
  row['INVOICE_DESC'] = d.invoice_desc || '';
  row['SHORT_DESC'] = d.short_desc || d.product_title || '';
  row['LONG_DESC1'] = d.long_description || '';
  row['RETAIL_DESC'] = d.retail_desc || '';
  row['MARKETING_DESCRIPTION'] = d.marketing_description || '';

  d.features.forEach((feat, i) => {
    if (i < 20) row[`ITEM_FEATURES_${i + 1}`] = feat;
  });

  row['With'] = d.withPhrase || '';
  row['Standard/Approvals'] = input.standardApprovals || '';
  row['Prop 65'] = input.prop65 || '';
  row['Application'] = input.application || '';
  row['Includes'] = input.includes || '';
  row['Product Name'] = d.productName || '';

  input.attributes.slice(0, 50).forEach((attr, i) => {
    const n = i + 1;
    row[`ATTRIBUTE_LABEL ${n}`] = attr.label || '';
    row[`ATTRIBUTE_VALUE ${n}`] = attr.value || '';
    row[`ATTRIBUTE_UOM ${n}`] = attr.uom || '';
  });

  if (input.unspsc) row['UNSPSC'] = input.unspsc;
  if (input.warranty) row['Warranty'] = input.warranty;
  if (input.warranty) row['Warranty Information'] = input.warranty;
  if (input.productImage) row['Product Image'] = input.productImage;
  if (input.countryOfOrigin) row['Country Of Origin'] = input.countryOfOrigin;
  if (input.actualImage) row['Actual Image (Yes/No)'] = input.actualImage;

  return row;
}
