import { ConnectorResult } from './generic-webhook.connector';

/** Stub — BigCommerce Catalog API placeholder. */
export async function pushBigcommerceProduct(
  _credentialsEnc: string | null | undefined,
  product: { sku: string },
): Promise<ConnectorResult> {
  return {
    success: false,
    error: 'BigCommerce connector stub — configure store hash + access token',
    responsePayload: { sku: product.sku, stub: true, connector: 'bigcommerce' },
  };
}
