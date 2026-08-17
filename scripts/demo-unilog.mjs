#!/usr/bin/env node
/**
 * Industrial enrichment demo runner.
 *
 * Assumes DB already seeded (pnpm db:seed or pnpm db:seed:unilog) and API is up.
 *
 *   API_URL=http://127.0.0.1:3300/api node scripts/demo-unilog.mjs
 *
 * Flow: login → enrich labelled SKUs → print eval (pending+accepted) →
 * optionally accept clear suggestions → re-eval.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveApiBase(raw) {
  const base = (raw || process.env.API_URL || 'http://127.0.0.1:3300/api').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API = resolveApiBase(process.env.API_URL);
const SEED_FIRST = process.env.DEMO_SEED !== 'false';

const LABELLED = [
  'UNI-FCT-001',
  'UNI-FCT-002',
  'UNI-FCT-003',
  'UNI-FCT-004',
  'UNI-FCT-005',
  'UNI-FIT-001',
  'UNI-FIT-002',
  'UNI-FIT-003',
  'UNI-FIT-004',
  'UNI-FIT-005',
];

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

function pct(n) {
  return `${Math.round((n || 0) * 1000) / 10}%`;
}

async function main() {
  if (SEED_FIRST) {
    console.log('Seeding industrial pack (pnpm db:seed:unilog)…');
    const r = spawnSync('pnpm', ['db:seed:unilog'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      console.warn('Seed failed or skipped — continuing if data already present');
    }
  }

  console.log(`Industrial demo against ${API}`);
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

  const enrich = await json(
    '/ai/unilog/enrich',
    { method: 'POST', body: JSON.stringify({ skus: LABELLED }) },
    headers,
  );
  console.log(
    `enrich: ${enrich.suggestionCount} suggestions / ${enrich.productCount} products` +
      ` · needsAttention=${enrich.needsAttentionCount} · autoCommitted=${enrich.autoCommitted}` +
      ` · deliveryPreviews=${(enrich.deliveryPreviews || []).length}`,
  );

  const batch = await json(
    '/ai/unilog/batch',
    { method: 'POST', body: JSON.stringify({ source: 'sample1000', limit: 25 }) },
    headers,
  );
  console.log(
    `batch: ${batch.rowCount} Delivery Format rows · needsReview=${batch.needsReviewCount}` +
      ` · headers=${(batch.deliveryFormatHeaders || []).length}`,
  );

  const exported = await json('/ai/unilog/export', {}, headers);
  if (!exported.csv || !exported.csv.startsWith('MFR URL,')) {
    throw new Error('export CSV missing frozen headers');
  }
  if ((exported.headerCount || 0) !== 252) {
    throw new Error(`expected 252 headers, got ${exported.headerCount}`);
  }
  console.log(`export: ${exported.rowCount} rows → ${exported.filename}`);

  let eval1 = await json('/ai/unilog/eval', {}, headers);
  console.log(
    `eval (pending+live): accuracy=${pct(eval1.fieldAccuracy)}` +
      ` lov=${pct(eval1.lovHitRate)} char=${pct(eval1.charLimitCompliance)}` +
      ` needsReview=${eval1.needsReviewCount}` +
      ` goldenDF=${pct(eval1.deliveryFormatEval?.fieldAccuracy)}` +
      ` sampleSubset=${pct(eval1.scoredSubsetAccuracy)}`,
  );

  const products = await json('/pim/products?search=UNI-&pageSize=80', {}, headers);
  const bySku = new Map((products.items || []).map((p) => [p.sku, p]));
  const acceptSkus = LABELLED.slice(0, 5);
  let accepted = 0;
  for (const sku of acceptSkus) {
    const product = bySku.get(sku);
    if (!product) continue;
    const suggestions = await json(
      `/ai/suggestions?status=pending&productId=${product.id}`,
      {},
      headers,
    );
    for (const s of suggestions || []) {
      if (s.source && s.source !== 'unilog_enrich') continue;
      if (s.explanation?.needsAttention) continue;
      await json(`/ai/suggestions/${s.id}/accept`, { method: 'POST', body: '{}' }, headers);
      accepted += 1;
    }
  }
  console.log(`accepted ${accepted} clear suggestions on ${acceptSkus.join(', ')}`);

  const eval2 = await json('/ai/unilog/eval?usePending=true', {}, headers);
  console.log(
    `eval after accept: accuracy=${pct(eval2.fieldAccuracy)}` +
      ` lov=${pct(eval2.lovHitRate)} char=${pct(eval2.charLimitCompliance)}`,
  );

  if (eval2.fieldAccuracy < 0.5) {
    throw new Error(
      `Field accuracy ${pct(eval2.fieldAccuracy)} below 50% threshold — check enrichment rules`,
    );
  }

  console.log('demo:unilog OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
