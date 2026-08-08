#!/usr/bin/env node
/**
 * Product Intelligence load verification (Phase 4).
 *
 * Seeds N products (default 500; set LOAD_SKU_COUNT=50000 for full brief),
 * enqueues batch fill + quality scan, then asserts queue depth drains
 * within a time budget without failed jobs climbing unbounded.
 *
 * Usage:
 *   API_URL=http://localhost:3100/api node scripts/load-intelligence.mjs
 *   LOAD_SKU_COUNT=2000 LOAD_BUDGET_MS=120000 node scripts/load-intelligence.mjs
 */

function resolveApiBase(raw) {
  const base = (raw || 'http://127.0.0.1:3100/api').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API = resolveApiBase(process.env.API_URL);
const SKU_COUNT = Number(process.env.LOAD_SKU_COUNT || 500);
const BATCH_LIMIT = Number(process.env.LOAD_BATCH_LIMIT || Math.min(SKU_COUNT, 100));
const BUDGET_MS = Number(process.env.LOAD_BUDGET_MS || 90_000);
const POLL_MS = Number(process.env.LOAD_POLL_MS || 1000);

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`Load test against ${API}`);
  console.log(`SKU_COUNT=${SKU_COUNT} BATCH_LIMIT=${BATCH_LIMIT} BUDGET_MS=${BUDGET_MS}`);

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

  const prefix = `LOAD-${Date.now().toString(36).toUpperCase()}`;
  let created = 0;
  const chunk = 50;
  for (let i = 0; i < SKU_COUNT; i += chunk) {
    const batch = [];
    for (let j = i; j < Math.min(SKU_COUNT, i + chunk); j++) {
      batch.push(
        json(
          '/pim/products',
          {
            method: 'POST',
            body: JSON.stringify({
              sku: `${prefix}-${String(j).padStart(5, '0')}`,
              familyId,
            }),
          },
          headers,
        ).catch((err) => {
          // Ignore duplicates on re-run
          if (String(err.message).includes('409') || String(err.message).includes('exists')) {
            return null;
          }
          throw err;
        }),
      );
    }
    await Promise.all(batch);
    created += batch.length;
    if (created % 200 === 0 || created >= SKU_COUNT) {
      console.log(`seeded ~${Math.min(created, SKU_COUNT)} / ${SKU_COUNT}`);
    }
  }

  const beforeMetrics = await json('/ai/jobs/metrics', {}, headers);
  const failedBefore = beforeMetrics.totals?.failed || 0;

  console.log('Enqueue batch fill (async)…');
  const batch = await json(
    '/ai/fill/batch',
    {
      method: 'POST',
      body: JSON.stringify({
        familyId,
        limit: BATCH_LIMIT,
        async: true,
      }),
    },
    headers,
  );
  console.log('batch jobs', batch.jobsEnqueued, 'correlation', batch.batchCorrelationId);

  console.log('Enqueue full quality scan (async)…');
  const scan = await json(
    '/ai/quality/scan',
    { method: 'POST', body: JSON.stringify({ async: true }) },
    headers,
  );
  console.log('scan correlation', scan.correlationId);

  const started = Date.now();
  let lastDepth = Infinity;
  let stableZero = 0;

  while (Date.now() - started < BUDGET_MS) {
    const metrics = await json('/ai/jobs/metrics', {}, headers);
    const depth =
      (metrics.totals?.queued || 0) +
      (metrics.totals?.running || 0);
    const failedDelta = (metrics.totals?.failed || 0) - failedBefore;
    console.log(
      `t=${Math.round((Date.now() - started) / 1000)}s depth=${depth} completed=${metrics.totals?.completed || 0} failedΔ=${failedDelta} rateLimitHits=${metrics.totals?.rateLimitHits || 0}`,
    );

    if (depth === 0) {
      stableZero += 1;
      if (stableZero >= 2) {
        if (failedDelta > Math.max(5, Math.floor(BATCH_LIMIT * 0.05))) {
          throw new Error(`Too many failed jobs: ${failedDelta}`);
        }
        console.log('LOAD_OK queue drained within budget');
        console.log(
          JSON.stringify(
            {
              seeded: SKU_COUNT,
              batchJobs: batch.jobsEnqueued,
              completed: metrics.totals?.completed,
              failedDelta,
              rateLimitHits: metrics.totals?.rateLimitHits,
              elapsedMs: Date.now() - started,
            },
            null,
            2,
          ),
        );
        return;
      }
    } else {
      stableZero = 0;
    }

    // Soft progress check — depth should trend down eventually
    if (depth > lastDepth * 2 && Date.now() - started > 15_000) {
      console.warn('depth increasing — possible backpressure (continuing)');
    }
    lastDepth = depth;
    await sleep(POLL_MS);
  }

  throw new Error(`LOAD_FAIL queue did not drain within ${BUDGET_MS}ms (lastDepth=${lastDepth})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
