#!/usr/bin/env node
/**
 * Industrial enrichment e2e: enrich 5 faucet rows → accept clear → eval ≥ threshold.
 *
 *   API_URL=http://127.0.0.1:3300/api node scripts/e2e-unilog.mjs
 */

function resolveApiBase(raw) {
  const base = (raw || process.env.API_URL || 'http://127.0.0.1:3300/api').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API = resolveApiBase(process.env.API_URL);
const FAUCETS = ['UNI-FCT-001', 'UNI-FCT-002', 'UNI-FCT-003', 'UNI-FCT-004', 'UNI-FCT-005'];
const MIN_ACCURACY = Number(process.env.UNILOG_MIN_ACCURACY || '0.55');

async function json(path, opts = {}, headers = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log(`E2E industrial enrichment against ${API}`);

  const login = await json('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'owner@kernle.local', password: 'demo1234' }),
  });
  const token = login.accessToken;
  const org =
    login.organizations?.[0]?.id ||
    login.memberships?.[0]?.organizationId ||
    login.user?.memberships?.[0]?.organizationId;
  if (!token || !org) throw new Error('login failed');
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-organization-id': org,
  };

  const products = await json('/pim/products?search=UNI-FCT&pageSize=50', {}, headers);
  const items = (products.items || []).filter((p) => FAUCETS.includes(p.sku));
  if (items.length < 5) {
    throw new Error(
      `Expected ≥5 UNI-FCT products, found ${items.length}. Run pnpm db:seed:unilog`,
    );
  }

  const enrich = await json(
    '/ai/unilog/enrich',
    { method: 'POST', body: JSON.stringify({ skus: FAUCETS }) },
    headers,
  );
  if (!enrich.suggestionCount) throw new Error('enrich produced 0 suggestions');
  if (enrich.autoCommitted !== false) throw new Error('enrich must not auto-commit');
  if (!enrich.deliveryPreviews?.length) throw new Error('enrich missing deliveryPreviews');

  const batch = await json(
    '/ai/unilog/batch',
    { method: 'POST', body: JSON.stringify({ source: 'sample1000', limit: 10 }) },
    headers,
  );
  if (batch.rowCount < 1) throw new Error('batch produced 0 rows');
  if ((batch.deliveryFormatHeaders || []).length !== 252) {
    throw new Error('batch headers !== 252');
  }

  const exported = await json('/ai/unilog/export', {}, headers);
  const headerLine = String(exported.csv || '').split('\n')[0];
  if (!headerLine.startsWith('MFR URL,')) throw new Error('export header mismatch');
  if (headerLine.split(',').length !== 252) throw new Error('export header count !== 252');

  let accepted = 0;
  for (const p of items) {
    const suggestions = await json(
      `/ai/suggestions?status=pending&productId=${p.id}`,
      {},
      headers,
    );
    for (const s of suggestions || []) {
      if (s.source !== 'unilog_enrich') continue;
      if (s.explanation?.needsAttention) continue;
      await json(`/ai/suggestions/${s.id}/accept`, { method: 'POST', body: '{}' }, headers);
      accepted += 1;
    }
  }
  if (accepted < 5) throw new Error(`expected ≥5 accepts, got ${accepted}`);

  // Confirm live values changed for at least one SKU
  const live = await json(`/pim/products/${items[0].id}`, {}, headers);
  const brand = live?.values?.brand;
  if (!brand) throw new Error('Accept did not write brand to live product');

  const score = await json('/ai/unilog/eval', {}, headers);
  console.log(
    JSON.stringify(
      {
        suggestionCount: enrich.suggestionCount,
        accepted,
        fieldAccuracy: score.fieldAccuracy,
        lovHitRate: score.lovHitRate,
        charLimitCompliance: score.charLimitCompliance,
        needsReviewCount: score.needsReviewCount,
        deliveryFormatHeaderCount: score.deliveryFormatHeaderCount,
        goldenDfAccuracy: score.deliveryFormatEval?.fieldAccuracy,
        exportHeaderCount: exported.headerCount,
        batchRows: batch.rowCount,
      },
      null,
      2,
    ),
  );

  if (score.fieldAccuracy < MIN_ACCURACY) {
    throw new Error(
      `fieldAccuracy ${score.fieldAccuracy} < ${MIN_ACCURACY}`,
    );
  }
  if (score.lovHitRate < 0.8) {
    throw new Error(`lovHitRate ${score.lovHitRate} < 0.8`);
  }
  if ((score.deliveryFormatEval?.fieldAccuracy || 0) < 0.9) {
    throw new Error(
      `golden Delivery Format accuracy ${score.deliveryFormatEval?.fieldAccuracy} < 0.9`,
    );
  }

  console.log('e2e-unilog OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
