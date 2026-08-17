import type { DeliveryFormatRow } from './delivery-format-types';

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Write CSV with frozen Expected Output headers only. */
export function exportDeliveryFormatCsv(
  headers: readonly string[],
  rows: DeliveryFormatRow[],
): string {
  if (headers.length !== 252) {
    throw new Error(`Expected 252 Delivery Format headers, got ${headers.length}`);
  }
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}
