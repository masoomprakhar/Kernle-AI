/** Frozen Expected Output headers — never reorder or rename. Loaded via load-data. */

export type DeliveryFormatRow = Record<string, string>;

export function emptyDeliveryFormatRow(headers: readonly string[]): DeliveryFormatRow {
  const row: DeliveryFormatRow = {};
  for (const h of headers) row[h] = '';
  return row;
}

export function assertDeliveryFormatHeaders(
  headers: string[],
  expected: readonly string[],
): void {
  if (headers.length !== expected.length) {
    throw new Error(
      `Delivery Format header count ${headers.length} !== ${expected.length}`,
    );
  }
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] !== expected[i]) {
      throw new Error(
        `Delivery Format header mismatch at ${i}: got "${headers[i]}" expected "${expected[i]}"`,
      );
    }
  }
}
