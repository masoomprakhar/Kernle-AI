import {
  PrismaClient,
  RoleName,
  UseCase,
  SkuBand,
  AttributeType,
  ConnectorType,
  SyncStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ROLES: { name: RoleName; description: string; permissions: string[] }[] = [
  {
    name: 'Owner',
    description: 'Full organization control',
    permissions: ['*'],
  },
  {
    name: 'Admin',
    description: 'Manage users, settings, and catalog',
    permissions: [
      'users:manage',
      'settings:manage',
      'catalog:write',
      'catalog:read',
      'assets:write',
      'import:run',
      'export:run',
      'syndication:manage',
      'ai:use',
    ],
  },
  {
    name: 'CatalogManager',
    description: 'Own the product catalog',
    permissions: [
      'catalog:write',
      'catalog:read',
      'assets:write',
      'import:run',
      'export:run',
      'ai:use',
    ],
  },
  {
    name: 'Contributor',
    description: 'Edit product data',
    permissions: ['catalog:write', 'catalog:read', 'assets:write', 'ai:use'],
  },
  {
    name: 'Viewer',
    description: 'Read-only access',
    permissions: ['catalog:read'],
  },
];

async function main() {
  for (const role of ROLES) {
    const permIds: string[] = [];
    for (const code of role.permissions) {
      const perm = await prisma.permission.upsert({
        where: { code },
        create: { code, description: code },
        update: {},
      });
      permIds.push(perm.id);
    }
    await prisma.role.upsert({
      where: { name: role.name },
      create: {
        name: role.name,
        description: role.description,
        permissions: { connect: permIds.map((id) => ({ id })) },
      },
      update: {
        description: role.description,
        permissions: { set: permIds.map((id) => ({ id })) },
      },
    });
  }

  const passwordHash = await bcrypt.hash('demo1234', 10);

  const org = await prisma.organization.upsert({
    where: { slug: 'kernle-demo' },
    create: {
      name: 'Kernle Demo',
      slug: 'kernle-demo',
      industry: 'Retail',
      useCase: UseCase.Retail,
      skuBand: SkuBand.one_k_10k,
      onboardingDone: true,
      plan: 'Growth',
    },
    update: { onboardingDone: true, plan: 'Growth' },
  });

  const workspace = await prisma.workspace.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'default' } },
    create: {
      organizationId: org.id,
      name: 'Default Catalog',
      slug: 'default',
      isDefault: true,
    },
    update: {},
  });

  const users = [
    { email: 'owner@kernle.local', name: 'Demo Owner', role: RoleName.Owner, super: true },
    { email: 'admin@kernle.local', name: 'Demo Admin', role: RoleName.Admin, super: false },
    { email: 'viewer@kernle.local', name: 'Demo Viewer', role: RoleName.Viewer, super: false },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        isSuperAdmin: u.super,
      },
      update: {
        passwordHash,
        emailVerifiedAt: new Date(),
        isSuperAdmin: u.super,
      },
    });

    const role = await prisma.role.findUniqueOrThrow({ where: { name: u.role } });
    await prisma.membership.upsert({
      where: {
        organizationId_userId: { organizationId: org.id, userId: user.id },
      },
      create: {
        organizationId: org.id,
        userId: user.id,
        roleId: role.id,
      },
      update: { roleId: role.id },
    });
  }

  for (const loc of [
    { code: 'en_US', label: 'English (US)' },
    { code: 'fr_FR', label: 'French (France)' },
  ]) {
    await prisma.locale.upsert({
      where: { organizationId_code: { organizationId: org.id, code: loc.code } },
      create: { organizationId: org.id, ...loc, enabled: true },
      update: {},
    });
  }

  const ecommerce = await prisma.channel.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'ecommerce' } },
    create: {
      organizationId: org.id,
      code: 'ecommerce',
      label: 'Ecommerce',
      locales: ['en_US', 'fr_FR'],
      activationStatus: 'active',
      connectorType: ConnectorType.shopify,
    },
    update: { activationStatus: 'active', connectorType: ConnectorType.shopify },
  });

  const marketplace = await prisma.channel.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'marketplace' } },
    create: {
      organizationId: org.id,
      code: 'marketplace',
      label: 'Marketplace',
      locales: ['en_US'],
      activationStatus: 'active',
      connectorType: ConnectorType.amazon,
    },
    update: { activationStatus: 'active', connectorType: ConnectorType.amazon },
  });

  const printChannel = await prisma.channel.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'print' } },
    create: {
      organizationId: org.id,
      code: 'print',
      label: 'Print catalog',
      locales: ['en_US'],
      activationStatus: 'draft',
      connectorType: ConnectorType.print,
    },
    update: {},
  });

  const group = await prisma.attributeGroup.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'general' } },
    create: {
      organizationId: org.id,
      code: 'general',
      label: { en_US: 'General' },
      sortOrder: 0,
    },
    update: {},
  });

  const attrs = [
    { code: 'name', label: { en_US: 'Name' }, type: AttributeType.text },
    { code: 'description', label: { en_US: 'Description' }, type: AttributeType.textarea },
    { code: 'color', label: { en_US: 'Color' }, type: AttributeType.text },
    { code: 'material', label: { en_US: 'Material' }, type: AttributeType.text },
    { code: 'price', label: { en_US: 'Price' }, type: AttributeType.price },
  ];

  const attrIds: Record<string, string> = {};
  for (const [i, a] of attrs.entries()) {
    const row = await prisma.attribute.upsert({
      where: { organizationId_code: { organizationId: org.id, code: a.code } },
      create: {
        organizationId: org.id,
        code: a.code,
        label: a.label,
        type: a.type,
        groupId: group.id,
        sortOrder: i,
        localizable: a.code === 'name' || a.code === 'description',
      },
      update: { groupId: group.id },
    });
    attrIds[a.code] = row.id;
  }

  const family = await prisma.family.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'apparel' } },
    create: {
      organizationId: org.id,
      code: 'apparel',
      label: { en_US: 'Apparel' },
      labelAttributeCode: 'name',
    },
    update: {},
  });

  for (const [i, code] of Object.keys(attrIds).entries()) {
    await prisma.familyAttribute.upsert({
      where: {
        familyId_attributeId: { familyId: family.id, attributeId: attrIds[code] },
      },
      create: {
        familyId: family.id,
        attributeId: attrIds[code],
        requiredForCompleteness: code === 'name' || code === 'description' ? ['ecommerce'] : [],
        sortOrder: i,
      },
      update: {},
    });
  }

  await prisma.category.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'footwear' } },
    create: {
      organizationId: org.id,
      code: 'footwear',
      label: { en_US: 'Footwear' },
      sortOrder: 0,
      productCount: 3,
    },
    update: { productCount: 3 },
  });
  await prisma.category.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'outerwear' } },
    create: {
      organizationId: org.id,
      code: 'outerwear',
      label: { en_US: 'Outerwear' },
      sortOrder: 1,
      productCount: 2,
    },
    update: { productCount: 2 },
  });

  const demoProducts = [
    {
      sku: 'SNK-AIR-01',
      name: 'Air Runner',
      completeness: { ecommerce_en_US: 96, marketplace_en_US: 88 },
      geoScore: 92,
      color: 'Glacier',
      material: 'Mesh',
      price: 129,
    },
    {
      sku: 'JKT-WOOL-12',
      name: 'Merino Jacket',
      completeness: { ecommerce_en_US: 71, marketplace_en_US: 54 },
      geoScore: 68,
      color: 'Charcoal',
      material: 'Merino wool',
      price: 248,
    },
    {
      sku: 'BAG-NYL-04',
      name: 'Day Pack',
      completeness: { ecommerce_en_US: 48, marketplace_en_US: 32 },
      geoScore: 41,
      color: 'Olive',
      material: 'Nylon',
      price: 89,
    },
    {
      sku: 'HAT-TRL-09',
      name: 'Trail Cap',
      completeness: { ecommerce_en_US: 88, marketplace_en_US: 80 },
      geoScore: 84,
      color: 'Sand',
      material: 'Cotton',
      price: 32,
    },
    {
      sku: 'VST-SFT-03',
      name: 'Softshell Vest',
      completeness: { ecommerce_en_US: 62, marketplace_en_US: 45 },
      geoScore: 55,
      color: 'Ink',
      material: 'Softshell',
      price: 156,
    },
    {
      sku: 'SHT-LIN-07',
      name: 'Linen Shirt',
      completeness: { ecommerce_en_US: 79, marketplace_en_US: 70 },
      geoScore: 74,
      color: 'Ivory',
      material: 'Linen',
      price: 98,
    },
  ];

  const productIds: Record<string, string> = {};
  for (const p of demoProducts) {
    const row = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId: org.id, sku: p.sku } },
      create: {
        organizationId: org.id,
        sku: p.sku,
        familyId: family.id,
        enabled: true,
        values: {
          name: { en_US: p.name },
          description: {
            en_US: `${p.name} — demo catalog product for Kernle AI.`,
          },
          color: p.color,
          material: p.material,
          price: { amount: p.price, currency: 'USD' },
        },
        completeness: p.completeness,
        geoScore: p.geoScore,
        searchText: `${p.sku} ${p.name} ${p.color} ${p.material}`.toLowerCase(),
      },
      update: {
        familyId: family.id,
        values: {
          name: { en_US: p.name },
          description: {
            en_US: `${p.name} — demo catalog product for Kernle AI.`,
          },
          color: p.color,
          material: p.material,
          price: { amount: p.price, currency: 'USD' },
        },
        completeness: p.completeness,
        geoScore: p.geoScore,
        searchText: `${p.sku} ${p.name} ${p.color} ${p.material}`.toLowerCase(),
        enabled: true,
      },
    });
    productIds[p.sku] = row.id;
  }

  // Channel sync dummy rows
  const syncPairs: Array<[string, string, SyncStatus]> = [
    [productIds['SNK-AIR-01'], ecommerce.id, SyncStatus.in_sync],
    [productIds['SNK-AIR-01'], marketplace.id, SyncStatus.in_sync],
    [productIds['JKT-WOOL-12'], ecommerce.id, SyncStatus.pending],
    [productIds['JKT-WOOL-12'], marketplace.id, SyncStatus.error],
    [productIds['BAG-NYL-04'], ecommerce.id, SyncStatus.error],
    [productIds['HAT-TRL-09'], ecommerce.id, SyncStatus.in_sync],
    [productIds['VST-SFT-03'], ecommerce.id, SyncStatus.pending],
    [productIds['SHT-LIN-07'], marketplace.id, SyncStatus.pending],
  ];

  for (const [productId, channelId, status] of syncPairs) {
    if (!productId) continue;
    await prisma.productChannelSync.upsert({
      where: { productId_channelId: { productId, channelId } },
      create: {
        productId,
        channelId,
        status,
        lastSyncAt: status === SyncStatus.in_sync ? new Date() : null,
        lastError: status === SyncStatus.error ? 'Missing required attribute: weight' : null,
      },
      update: {
        status,
        lastSyncAt: status === SyncStatus.in_sync ? new Date() : null,
        lastError: status === SyncStatus.error ? 'Missing required attribute: weight' : null,
      },
    });
  }

  // Clear and recreate demo findings / suggestions for a fresh dashboard
  await prisma.qualityFinding.deleteMany({
    where: { organizationId: org.id, title: { startsWith: '[Demo]' } },
  });
  await prisma.aiSuggestion.deleteMany({
    where: { organizationId: org.id, source: 'demo-seed' },
  });

  const findings = [
    {
      severity: 'high',
      title: '[Demo] Missing packshot on Day Pack',
      description: 'BAG-NYL-04 has no main image linked for Ecommerce en_US.',
      entityId: productIds['BAG-NYL-04'],
    },
    {
      severity: 'high',
      title: '[Demo] Thin description on Merino Jacket',
      description: 'Description is under 80 characters for marketplace readiness.',
      entityId: productIds['JKT-WOOL-12'],
    },
    {
      severity: 'medium',
      title: '[Demo] Softshell Vest below 70% completeness',
      description: 'VST-SFT-03 is blocking publish on Marketplace.',
      entityId: productIds['VST-SFT-03'],
    },
    {
      severity: 'medium',
      title: '[Demo] Color attribute inconsistent casing',
      description: 'Some apparel SKUs use "Charcoal" vs "charcoal".',
      entityId: productIds['JKT-WOOL-12'],
    },
    {
      severity: 'low',
      title: '[Demo] Print channel not activated',
      description: 'Print catalog channel is still in draft.',
      entityId: printChannel.id,
    },
  ];

  for (const f of findings) {
    await prisma.qualityFinding.create({
      data: {
        organizationId: org.id,
        category: 'completeness',
        severity: f.severity,
        title: f.title,
        description: f.description,
        entityType: 'product',
        entityId: f.entityId,
        resolved: false,
      },
    });
  }

  const suggestions = [
    {
      productId: productIds['JKT-WOOL-12'],
      attributeCode: 'material',
      suggestedValue: 'Merino wool',
      confidence: 'high',
      confidenceScore: 8.6,
    },
    {
      productId: productIds['BAG-NYL-04'],
      attributeCode: 'description',
      suggestedValue:
        'Lightweight day pack with padded straps and a weather-resistant nylon shell.',
      confidence: 'medium',
      confidenceScore: 7.4,
    },
    {
      productId: productIds['VST-SFT-03'],
      attributeCode: 'color',
      suggestedValue: 'Ink',
      confidence: 'high',
      confidenceScore: 9.1,
    },
    {
      productId: productIds['SHT-LIN-07'],
      attributeCode: 'care',
      suggestedValue: 'Machine wash cold, hang dry',
      confidence: 'medium',
      confidenceScore: 7.9,
    },
  ];

  for (const s of suggestions) {
    if (!s.productId) continue;
    await prisma.aiSuggestion.create({
      data: {
        organizationId: org.id,
        productId: s.productId,
        attributeCode: s.attributeCode,
        suggestedValue: s.suggestedValue,
        confidence: s.confidence,
        confidenceScore: s.confidenceScore,
        status: 'pending',
        source: 'demo-seed',
      },
    });
  }

  if (process.env.SEED_UNILOG !== 'false' && process.env.SEED_UNILOG !== '0') {
    const { seedUnilog } = await import('./seed-unilog');
    const uni = await seedUnilog(org.id);
    console.log(`Unilog industrial seed: products=${uni.products}`);
  }

  console.log(
    `Seed complete: org=${org.slug} workspace=${workspace.slug} products=${demoProducts.length} findings=${findings.length} suggestions=${suggestions.length}`,
  );
  console.log('Login: owner@kernle.local / demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
