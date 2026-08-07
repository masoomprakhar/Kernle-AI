import { PrismaClient, RoleName, UseCase, SkuBand } from '@prisma/client';
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
    update: {},
  });

  await prisma.workspace.upsert({
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

  const locales = [
    { code: 'en_US', label: 'English (US)' },
    { code: 'fr_FR', label: 'French (France)' },
  ];
  for (const loc of locales) {
    await prisma.locale.upsert({
      where: { organizationId_code: { organizationId: org.id, code: loc.code } },
      create: { organizationId: org.id, ...loc, enabled: true },
      update: {},
    });
  }

  await prisma.channel.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'ecommerce' } },
    create: {
      organizationId: org.id,
      code: 'ecommerce',
      label: 'Ecommerce',
      locales: ['en_US', 'fr_FR'],
      activationStatus: 'active',
    },
    update: {},
  });

  console.log('Seed complete: Kernle Demo org with owner/admin/viewer (password: demo1234)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
