#!/usr/bin/env node
/**
 * Broad authenticated API probe across Kernle modules.
 * Usage: API_URL=http://localhost:3200/api node scripts/probe-apis.mjs
 */

function resolveApiBase(raw) {
  const base = (raw || 'http://127.0.0.1:3200/api').replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

const API = resolveApiBase(process.env.API_URL || process.env.SMOKE_API_URL);
const results = [];

async function probe(name, path, opts = {}, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        ...(opts.body && !(opts.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...headers,
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    const ok = opts.expectStatus ? res.status === opts.expectStatus : res.ok;
    results.push({
      name,
      path,
      status: res.status,
      ms: Date.now() - started,
      ok,
      detail: ok
        ? Array.isArray(body)
          ? `array(${body.length})`
          : body && typeof body === 'object'
            ? Object.keys(body).slice(0, 6).join(',')
            : String(body).slice(0, 60)
        : typeof body === 'string'
          ? body.slice(0, 120)
          : JSON.stringify(body).slice(0, 120),
    });
    return { ok, status: res.status, body };
  } catch (e) {
    results.push({
      name,
      path,
      status: 0,
      ms: Date.now() - started,
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, status: 0, body: null };
  }
}

async function main() {
  console.log(`Probing ${API}`);

  await probe('health', '/health');

  const login = await probe('auth.login', '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'owner@kernle.local', password: 'demo1234' }),
  });
  if (!login.ok) {
    console.error('Login failed — aborting');
    printSummary();
    process.exit(1);
  }

  const token = login.body.accessToken;
  const org =
    login.body.organizations?.[0]?.id ||
    login.body.memberships?.[0]?.organizationId ||
    login.body.user?.memberships?.[0]?.organizationId;
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-organization-id': org,
  };

  await probe('auth.me', '/auth/me', {}, headers);
  await probe('orgs.current', '/orgs/current', {}, headers);
  await probe('orgs.members', '/orgs/members', {}, headers);
  await probe('workspaces', '/workspaces', {}, headers);

  await probe('pim.attributes', '/pim/attributes', {}, headers);
  await probe('pim.families', '/pim/families', {}, headers);
  await probe('pim.categories', '/pim/categories', {}, headers);
  await probe('pim.products', '/pim/products?pageSize=5', {}, headers);
  await probe('pim.channels', '/pim/channels', {}, headers);
  await probe('pim.locales', '/pim/locales', {}, headers);
  await probe('pim.attribute-groups', '/pim/attribute-groups', {}, headers);
  await probe('pim.product-models', '/pim/product-models', {}, headers);

  await probe('dam.assets', '/dam/assets', {}, headers);
  await probe('ai.suggestions', '/ai/suggestions?status=pending', {}, headers);
  await probe('ai.suggestions.grouped', '/ai/suggestions?status=pending&grouped=true', {}, headers);
  await probe('ai.accuracy', '/ai/insights/accuracy', {}, headers);
  await probe('ai.overview', '/ai/insights/overview?days=30', {}, headers);
  await probe('ai.findings', '/ai/quality/findings?resolved=false', {}, headers);
  await probe('ai.sources', '/ai/sources', {}, headers);
  await probe('ai.usage', '/ai/usage', {}, headers);
  await probe('ai.jobs', '/ai/jobs/metrics', {}, headers);
  await probe('ai.signals', '/ai/market-signals', {}, headers);
  await probe('ai.correlation', '/ai/market-signals/correlation', {}, headers);

  await probe('ai.ask', '/ai/ask', {
    method: 'POST',
    body: JSON.stringify({ message: 'How many products are incomplete?' }),
  }, headers);

  const families = await probe('pim.families.forFill', '/pim/families', {}, headers);
  const familyId = Array.isArray(families.body) ? families.body[0]?.id : null;
  if (familyId) {
    await probe('ai.fill.batch', '/ai/fill/batch', {
      method: 'POST',
      body: JSON.stringify({ familyId, limit: 1, async: true }),
    }, headers);
  }

  await probe('ai.quality.scan', '/ai/quality/scan', {
    method: 'POST',
    body: JSON.stringify({ async: true }),
  }, headers);

  const src = await probe('ai.sources.create', '/ai/sources', {
    method: 'POST',
    body: JSON.stringify({
      type: 'text_paste',
      text: 'Name: Probe Shoe\nColor: Slate\nMaterial: Mesh\nPrice: 99',
    }),
  }, headers);

  if (src.ok && familyId) {
    const extract = await probe('ai.extract', '/ai/extract', {
      method: 'POST',
      body: JSON.stringify({
        familyId,
        sourceDocumentIds: [src.body.id],
        sku: `PROBE-${Date.now().toString(36).toUpperCase()}`,
      }),
    }, headers);
    if (extract.ok && extract.body?.productId) {
      const pid = extract.body.productId;
      await probe('pim.product.get', `/pim/products/${pid}`, {}, headers);
      const sugs = await probe(
        'ai.suggestions.product',
        `/ai/suggestions?status=pending&productId=${pid}`,
        {},
        headers,
      );
      const first = Array.isArray(sugs.body)
        ? sugs.body.find(
            (s) =>
              !s.explanation?.notFound &&
              !(s.suggestedValue && s.suggestedValue.not_found_in_source),
          )
        : null;
      if (first) {
        await probe(`ai.suggest.accept`, `/ai/suggestions/${first.id}/accept`, {
          method: 'POST',
          body: '{}',
        }, headers);
      }
    }
  }

  await probe('syndication.dashboard', '/syndication/dashboard', {}, headers);
  await probe('import.profiles', '/import-export/profiles', {}, headers);
  await probe('export.profiles', '/import-export/export/profiles', {}, headers);
  await probe('import.jobs', '/import-export/import/jobs', {}, headers);
  await probe('suppliers', '/suppliers', {}, headers);
  await probe('suppliers.review', '/suppliers/review/queue', {}, headers);
  await probe('invites', '/invites', {}, headers);
  await probe('audit', '/audit', {}, headers);
  await probe('billing.usage', '/billing/usage', {}, headers);
  await probe('admin.orgs', '/admin/orgs', {}, headers);

  printSummary();
  const failed = results.filter((r) => !r.ok);
  if (failed.length) process.exit(1);
  console.log('PROBE_OK');
}

function printSummary() {
  const width = Math.max(...results.map((r) => r.name.length), 8);
  for (const r of results) {
    const mark = r.ok ? 'OK ' : 'FAIL';
    console.log(
      `${mark} ${r.name.padEnd(width)} ${String(r.status).padStart(3)} ${String(r.ms).padStart(4)}ms  ${r.detail}`,
    );
  }
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} probes passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
