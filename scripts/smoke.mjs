const raw = process.env.SMOKE_API_URL || process.env.API_URL || 'http://127.0.0.1:3000';
const API = raw.endsWith('/api') ? raw : `${raw.replace(/\/$/, '')}/api`;

async function req(path, { method = 'GET', token, org, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (org) headers['x-organization-id'] = org;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

async function main() {
  console.log('health', await req('/health'));

  const login = await req('/auth/login', {
    method: 'POST',
    body: { email: 'owner@kernle.local', password: 'demo1234' },
  });
  const token = login.accessToken;
  const org = login.memberships[0].organizationId;
  console.log('login ok', login.user.email, org);

  const attrs = [];
  for (const a of [
    { code: 'name', label: { en_US: 'Name' }, type: 'text', localizable: true },
    { code: 'description', label: { en_US: 'Description' }, type: 'textarea', localizable: true },
    { code: 'brand', label: { en_US: 'Brand' }, type: 'text' },
    {
      code: 'color',
      label: { en_US: 'Color' },
      type: 'select',
      options: [
        { code: 'red', label: { en_US: 'Red' } },
        { code: 'blue', label: { en_US: 'Blue' } },
      ],
    },
    {
      code: 'size',
      label: { en_US: 'Size' },
      type: 'select',
      options: [
        { code: 'm', label: { en_US: 'M' } },
        { code: 'l', label: { en_US: 'L' } },
      ],
    },
    { code: 'price', label: { en_US: 'Price' }, type: 'price' },
    { code: 'images', label: { en_US: 'Images' }, type: 'media' },
  ]) {
    try {
      attrs.push(await req('/pim/attributes', { method: 'POST', token, org, body: a }));
    } catch (e) {
      // already exists from prior run — list instead
      console.log('attr create skip', a.code, String(e.message).slice(0, 80));
    }
  }
  const listed = await req('/pim/attributes', { token, org });
  const all = Array.isArray(listed) ? listed : listed.items || [];
  console.log('attributes', all.length);

  let family;
  try {
    family = await req('/pim/families', {
      method: 'POST',
      token,
      org,
      body: {
        code: 'sneakers',
        label: { en_US: 'Sneakers' },
        labelAttributeCode: 'name',
        attributes: all.map((x) => ({
          attributeId: x.id,
          requiredForCompleteness: [{ channel: 'ecommerce', locale: 'en_US' }],
        })),
      },
    });
  } catch (e) {
    const families = await req('/pim/families', { token, org });
    const list = Array.isArray(families) ? families : families.items || [];
    family = list.find((f) => f.code === 'sneakers') || list[0];
    console.log('family reuse', family?.code, String(e.message).slice(0, 80));
  }
  console.log('family', family.id, family.code);

  const product = await req('/pim/products', {
    method: 'POST',
    token,
    org,
    body: {
      sku: `SNK-${Date.now()}`,
      familyId: family.id,
      values: {
        name: [{ locale: 'en_US', channel: null, data: 'Air Runner' }],
        brand: [{ locale: null, channel: null, data: 'Kernle' }],
        color: [{ locale: null, channel: null, data: 'red' }],
        price: [{ locale: null, channel: null, data: { amount: 120, currency: 'USD' } }],
      },
    },
  });
  console.log('product', product.sku, 'completeness', product.completeness, 'geo', product.geoScore);

  const model = await req('/pim/product-models', {
    method: 'POST',
    token,
    org,
    body: {
      code: `sneaker-model-${Date.now()}`,
      familyId: family.id,
      variantAxes: ['color', 'size'],
      sharedValues: {
        name: [{ locale: 'en_US', channel: null, data: 'Variant Tee' }],
        brand: [{ locale: null, channel: null, data: 'Kernle' }],
      },
    },
  });
  const variants = await req(`/pim/product-models/${model.id}/generate-variants`, {
    method: 'POST',
    token,
    org,
  });
  console.log('variants generated', Array.isArray(variants) ? variants.length : variants);

  const cat = await req('/pim/categories', {
    method: 'POST',
    token,
    org,
    body: { code: `fashion-${Date.now()}`, label: { en_US: 'Fashion' } },
  });
  await req(`/pim/products/${product.id}/categories`, {
    method: 'POST',
    token,
    org,
    body: { categoryIds: [cat.id] },
  });
  console.log('category assigned', cat.code);

  const ask = await req('/ai/ask', {
    method: 'POST',
    token,
    org,
    body: { message: 'which products in Sneakers are under 70% complete' },
  });
  console.log('ask', ask.reply?.slice?.(0, 160) || ask);

  await req('/ai/quality/scan', { method: 'POST', token, org });
  await new Promise((r) => setTimeout(r, 500));
  const findings = await req('/ai/quality/findings', { token, org });
  console.log('findings', Array.isArray(findings) ? findings.length : findings);

  const suggest = await req('/ai/fill/suggest', {
    method: 'POST',
    token,
    org,
    body: { productId: product.id, attributeCodes: ['description'] },
  });
  const firstSuggest = Array.isArray(suggest) ? suggest[0] : suggest?.suggestions?.[0] || suggest;
  console.log('suggestion', firstSuggest?.id || firstSuggest, firstSuggest?.confidence || firstSuggest?.status);

  const csvText = [
    'sku,name,color',
    `IMP-${Date.now()}-1,Imported One,blue`,
    ',bad-row,',
    `IMP-${Date.now()}-2,Imported Two,red`,
  ].join('\n');
  const imp = await req('/import-export/import/csv', {
    method: 'POST',
    token,
    org,
    body: {
      csvText,
      columnMapping: { sku: 'sku', name: 'name', color: 'color' },
      updateBehavior: 'upsert',
    },
  });
  console.log('import', { success: imp.successRows, error: imp.errorRows, status: imp.status });

  const exp = await req('/import-export/export/csv', {
    method: 'POST',
    token,
    org,
    body: { fields: ['sku', 'name', 'color'] },
  });
  console.log('export', exp.id || exp.status, exp.rowCount);

  const channels = await req('/pim/channels', { token, org });
  const channel = (Array.isArray(channels) ? channels : [])[0];
  if (channel) {
    const ready = await req(`/syndication/channels/${channel.id}/readiness?productId=${product.id}`, {
      token,
      org,
    });
    console.log('readiness', ready);
  }

  const usage = await req('/billing/usage', { token, org });
  console.log('billing', usage);

  const viewerLogin = await req('/auth/login', {
    method: 'POST',
    body: { email: 'viewer@kernle.local', password: 'demo1234' },
  });
  try {
    await req('/pim/products', {
      method: 'POST',
      token: viewerLogin.accessToken,
      org,
      body: { sku: 'SHOULD-FAIL' },
    });
    throw new Error('RBAC failed — viewer created product');
  } catch (e) {
    if (!String(e.message).includes('403')) throw e;
    console.log('rbac ok — viewer blocked');
  }

  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error('SMOKE_FAIL', e);
  process.exit(1);
});
