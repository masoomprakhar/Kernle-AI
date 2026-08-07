/**
 * Generic ERP connector interface + mock REST implementation.
 * Extension points for SAP / NetSuite / Dynamics: implement ErpConnector
 * and register in ImportExportModule.
 */

export interface ErpProductPayload {
  sku: string;
  values: Record<string, unknown>;
  enabled?: boolean;
}

export interface ErpConnector {
  readonly name: string;
  pull(since?: Date): Promise<ErpProductPayload[]>;
  push(products: ErpProductPayload[]): Promise<{ ok: number; failed: number; errors: string[] }>;
}

/** Reference mock ERP — in-memory catalog over a fake REST shape. */
export class MockRestErpConnector implements ErpConnector {
  readonly name = 'mock_rest_erp';
  private store = new Map<string, ErpProductPayload>();

  constructor(seed: ErpProductPayload[] = []) {
    for (const p of seed) this.store.set(p.sku, p);
  }

  async pull(since?: Date): Promise<ErpProductPayload[]> {
    void since;
    return [...this.store.values()];
  }

  async push(products: ErpProductPayload[]) {
    let ok = 0;
    const errors: string[] = [];
    for (const p of products) {
      if (!p.sku) {
        errors.push('missing sku');
        continue;
      }
      this.store.set(p.sku, p);
      ok++;
    }
    return { ok, failed: errors.length, errors };
  }
}
