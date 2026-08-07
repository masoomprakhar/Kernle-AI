import { ConnectorResult } from './generic-webhook.connector';

/** Stub — Walmart Marketplace API placeholder. */
export async function pushWalmartProduct(
  _credentialsEnc: string | null | undefined,
  product: { sku: string },
): Promise<ConnectorResult> {
  return {
    success: false,
    error: 'Walmart connector stub — configure Marketplace API credentials',
    responsePayload: { sku: product.sku, stub: true, connector: 'walmart' },
  };
}
