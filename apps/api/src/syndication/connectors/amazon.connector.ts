import { ConnectorResult } from './generic-webhook.connector';

/** Stub — Amazon SP-API integration placeholder. */
export async function pushAmazonProduct(
  _credentialsEnc: string | null | undefined,
  product: { sku: string },
): Promise<ConnectorResult> {
  return {
    success: false,
    error: 'Amazon connector stub — configure SP-API credentials and listing flow',
    responsePayload: { sku: product.sku, stub: true, connector: 'amazon' },
  };
}
