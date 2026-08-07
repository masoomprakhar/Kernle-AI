import { ConnectorResult } from './generic-webhook.connector';

/** Stub — Google Merchant Center Content API placeholder. */
export async function pushGoogleProduct(
  _credentialsEnc: string | null | undefined,
  product: { sku: string },
): Promise<ConnectorResult> {
  return {
    success: false,
    error: 'Google Merchant connector stub — configure Content API',
    responsePayload: { sku: product.sku, stub: true, connector: 'google' },
  };
}
