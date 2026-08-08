#!/usr/bin/env node
/**
 * Phase 5 end-to-end Product Intelligence workflow.
 *
 * Seeds name + mock URL + mock PDF text source → extract → assert explanations
 * on every non-not-found suggestion → Accept writable fields → assert product
 * values + overview metrics move.
 *
 * Usage:
 *   API_URL=http://localhost:3100/api node scripts/e2e-intelligence.mjs
 */

function resolveApiBase(raw) {
  const base = (raw || 'http://127.0.0.1:3100/api').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API = resolveApiBase(process.env.API_URL);

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

function isNotFound(s) {
  const v = s.suggestedValue;
  return Boolean(
    s.explanation?.notFound ||
      (v && typeof v === 'object' && 'not_found_in_source' in v),
  );
}

async function main() {
  console.log(`E2E Product Intelligence against ${API}`);

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

  const families = await json('/pim/families', {}, headers);
  const familyId = families[0]?.id;
  if (!familyId) throw new Error('no family');

  const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;
  const paste =
    'Name: E2E Trail Runner\nColor: Glacier\nMaterial: Recycled mesh\nPrice: 159\nLightweight trail shoe for e2e verification.';

  const textSource = await json(
    '/ai/sources',
    { method: 'POST', body: JSON.stringify({ type: 'text_paste', text: paste }) },
    headers,
  );
  const urlSource = await json(
    '/ai/sources',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'url',
        url: 'https://example.com/products/e2e-trail-runner',
      }),
    },
    headers,
  );

  // Mock PDF via multipart upload (AI_MOCK / text extract path)
  const pdfBody = new Blob(
    [
      '%PDF-1.4 mock\nName: E2E Trail Runner\nColor: Glacier\nMaterial: Recycled mesh\nWeight: 1.2kg\n',
    ],
    { type: 'application/pdf' },
  );
  const fd = new FormData();
  fd.append('file', pdfBody, 'e2e-spec.pdf');
  const uploadRes = await fetch(`${API}/ai/sources/upload`, {
    method: 'POST',
    headers: {
      Authorization: headers.Authorization,
      'x-organization-id': headers['x-organization-id'],
    },
    body: fd,
  });
  const pdfSource = await uploadRes.json();
  if (!uploadRes.ok) {
    throw new Error(`upload failed ${uploadRes.status} ${JSON.stringify(pdfSource)}`);
  }

  const sourceIds = [textSource.id, urlSource.id, pdfSource.id];
  console.log('sources', sourceIds.map((id) => id.slice(0, 8)).join(', '));

  const extract = await json(
    '/ai/extract',
    {
      method: 'POST',
      body: JSON.stringify({ familyId, sourceDocumentIds: sourceIds, sku }),
    },
    headers,
  );
  const productId = extract.productId;
  if (!productId) throw new Error('extract missing productId');
  console.log('product', productId, 'corr', extract.correlationId);

  const suggestions = await json(
    `/ai/suggestions?status=pending&productId=${productId}`,
    {},
    headers,
  );
  if (!Array.isArray(suggestions) || !suggestions.length) {
    throw new Error('expected pending suggestions after extract');
  }

  let accepted = 0;
  const seenConflictGroups = new Set();
  for (const s of suggestions) {
    const exp = s.explanation;
    if (!exp || typeof exp !== 'object') {
      throw new Error(`suggestion ${s.id} missing explanation`);
    }
    if (!exp.reason && !exp.notFound) {
      throw new Error(`suggestion ${s.attributeCode} missing explanation.reason`);
    }
    if (isNotFound(s)) continue;

    // Conflicts: explicit human choice — Accept one candidate per group.
    if (exp.conflict) {
      const gid = exp.conflictGroupId || s.attributeCode || s.id;
      if (seenConflictGroups.has(gid)) continue;
      seenConflictGroups.add(gid);
    }

    await json(`/ai/suggestions/${s.id}/accept`, { method: 'POST', body: '{}' }, headers);
    accepted += 1;
  }
  if (accepted < 1) throw new Error('expected to accept at least one suggestion');

  const product = await json(`/pim/products/${productId}`, {}, headers);
  const values = product.values || {};
  const filled = Object.keys(values).filter((k) => {
    const v = values[k];
    return v != null && v !== '' && !(typeof v === 'object' && Object.keys(v).length === 0);
  });
  if (!filled.length) throw new Error('product values empty after accept');

  // Bulk run against this product with a refreshed paste (queued)
  const bulk = await json(
    '/ai/intelligence/bulk-run',
    {
      method: 'POST',
      body: JSON.stringify({
        productIds: [productId],
        type: 'text_paste',
        text: 'Name: E2E Trail Runner Refresh\nColor: Glacier\nMaterial: Recycled mesh',
        async: true,
      }),
    },
    headers,
  );
  if (!bulk.jobsEnqueued) throw new Error('bulk run did not enqueue');

  const overview = await json('/ai/insights/overview?days=30', {}, headers);
  if (typeof overview.productsFromSource !== 'number') {
    throw new Error('overview missing productsFromSource');
  }

  console.log(
    JSON.stringify(
      {
        sku,
        productId,
        suggestions: suggestions.length,
        accepted,
        filledAttributes: filled,
        bulkJobs: bulk.jobsEnqueued,
        overviewProductsFromSource: overview.productsFromSource,
        pendingSuggestions: overview.pendingSuggestions,
      },
      null,
      2,
    ),
  );
  console.log('E2E_INTELLIGENCE_OK');
}

main().catch((err) => {
  console.error('E2E_INTELLIGENCE_FAIL', err);
  process.exit(1);
});
