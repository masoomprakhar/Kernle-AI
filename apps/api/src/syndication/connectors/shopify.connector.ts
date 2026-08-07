import { ConnectorResult } from './generic-webhook.connector';

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
  apiVersion?: string;
}

function parseCredentials(raw: string | null | undefined): ShopifyCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.shopDomain && parsed.accessToken) return parsed;
  } catch {
    /* credentialsEnc may be "domain|token" */
    const [shopDomain, accessToken] = raw.split('|');
    if (shopDomain && accessToken) return { shopDomain, accessToken };
  }
  return null;
}

function mapProduct(product: {
  sku: string;
  values: Record<string, any>;
  enabled: boolean;
}) {
  const pick = (code: string) => {
    const v = product.values?.[code];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'object') return v;
    const ch = v['<all_channels>'] || Object.values(v)[0];
    if (typeof ch !== 'object' || ch === null) return ch;
    return ch['<all_locales>'] ?? Object.values(ch)[0];
  };

  return {
    product: {
      title: String(pick('name') || pick('title') || product.sku),
      body_html: String(pick('description') || ''),
      vendor: String(pick('brand') || ''),
      status: product.enabled ? 'active' : 'draft',
      variants: [
        {
          sku: product.sku,
          price: String(pick('price') || '0'),
          barcode: String(pick('gtin') || pick('ean') || ''),
        },
      ],
    },
  };
}

/** Real Shopify Admin REST API call to products.json */
export async function pushShopifyProduct(
  credentialsEnc: string | null | undefined,
  product: { sku: string; values: Record<string, any>; enabled: boolean },
  externalId?: string | null,
): Promise<ConnectorResult> {
  const creds = parseCredentials(credentialsEnc || undefined);
  if (!creds) {
    return { success: false, error: 'Invalid Shopify credentials (expect JSON {shopDomain,accessToken})' };
  }

  const version = creds.apiVersion || '2024-10';
  const domain = creds.shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const base = `https://${domain}/admin/api/${version}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': creds.accessToken,
  };

  try {
    const body = mapProduct(product);
    let res: Response;
    if (externalId) {
      res = await fetch(`${base}/products/${externalId}.json`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
    } else {
      res = await fetch(`${base}/products.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        responsePayload: json,
        error: `Shopify HTTP ${res.status}: ${JSON.stringify(json?.errors || json)}`,
      };
    }
    const id = json?.product?.id ? String(json.product.id) : externalId || undefined;
    return { success: true, externalId: id, responsePayload: json };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
