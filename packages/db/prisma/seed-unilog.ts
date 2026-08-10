import {
  PrismaClient,
  AttributeType,
  UseCase,
  SourceDocumentType,
  SourceDocumentStatus,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, 'data', 'unilog');

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')) as T;
}

type RawItem = {
  sku: string;
  mfgPartNum: string;
  partDesc: string;
  e1Brand: string;
  unilogBrand: string;
  dibBrand: string;
  familyHint: 'faucet' | 'fitting';
};

type LovFile = {
  classpath: string;
  attributes: Record<string, string[]>;
};

function optList(values: string[]) {
  return values.map((v) => ({ code: v, label: { en_US: v } }));
}

function pickBrandHint(item: RawItem): string {
  for (const v of [item.unilogBrand, item.dibBrand, item.e1Brand]) {
    if (v && !v.includes('--')) return v;
  }
  return '';
}

export async function seedUnilog(organizationId: string, actorId?: string) {
  const raw = loadJson<RawItem[]>('raw_items.json');
  const faucetLov = loadJson<LovFile>('lov_faucets.json');
  const fittingLov = loadJson<LovFile>('lov_fittings.json');

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      industry: 'Industrial Distribution',
      useCase: UseCase.B2B_Manufacturing,
    },
  });

  const group = await prisma.attributeGroup.upsert({
    where: { organizationId_code: { organizationId, code: 'industrial' } },
    create: {
      organizationId,
      code: 'industrial',
      label: { en_US: 'Industrial / Unilog' },
      sortOrder: 10,
    },
    update: {},
  });

  const sharedAttrs: Array<{
    code: string;
    label: string;
    type: AttributeType;
    options?: ReturnType<typeof optList>;
    validationRules?: Record<string, unknown>;
    localizable?: boolean;
  }> = [
    { code: 'brand', label: 'Brand', type: AttributeType.select, options: optList([
      'MOEN®', 'DELTA®', 'KOHLER®', 'UPONOR®', 'NIBCO®', 'CHARLOTTE PIPE®', 'WATTS®', 'AMERICAN STANDARD®',
    ]) },
    { code: 'manufacturer', label: 'Manufacturer', type: AttributeType.text },
    { code: 'mpn', label: 'Manufacturer Part Number', type: AttributeType.text },
    { code: 'classpath', label: 'Classpath', type: AttributeType.text },
    { code: 'part_desc_raw', label: 'Raw Part Description', type: AttributeType.text },
    { code: 'size', label: 'Size', type: AttributeType.text },
    {
      code: 'invoice_desc',
      label: 'Invoice Description',
      type: AttributeType.text,
      validationRules: { maxLength: 40 },
    },
    {
      code: 'mobile_desc',
      label: 'Mobile Description',
      type: AttributeType.text,
      validationRules: { minLength: 60, maxLength: 80 },
    },
    { code: 'product_title', label: 'Product Title', type: AttributeType.text, localizable: true },
    {
      code: 'long_description',
      label: 'Long Description',
      type: AttributeType.textarea,
      localizable: true,
    },
  ];

  const faucetExtra = [
    { code: 'finish', label: 'Finish', type: AttributeType.select, options: optList(faucetLov.attributes.finish) },
    { code: 'mounting', label: 'Mounting', type: AttributeType.select, options: optList(faucetLov.attributes.mounting) },
    { code: 'handle_type', label: 'Handle Type', type: AttributeType.select, options: optList(faucetLov.attributes.handle_type) },
    { code: 'spout_type', label: 'Spout Type', type: AttributeType.select, options: optList(faucetLov.attributes.spout_type) },
    { code: 'faucet_material', label: 'Body Material', type: AttributeType.select, options: optList(faucetLov.attributes.material) },
    { code: 'connection_type', label: 'Connection Type', type: AttributeType.select, options: optList([
      ...faucetLov.attributes.connection_type,
      ...fittingLov.attributes.connection_type,
    ]) },
  ];

  const fittingExtra = [
    { code: 'fitting_type', label: 'Fitting Type', type: AttributeType.select, options: optList(fittingLov.attributes.fitting_type) },
    { code: 'fitting_material', label: 'Material', type: AttributeType.select, options: optList(fittingLov.attributes.material) },
    { code: 'angle', label: 'Angle', type: AttributeType.select, options: optList(fittingLov.attributes.angle) },
    { code: 'pressure_class', label: 'Pressure Class', type: AttributeType.select, options: optList(fittingLov.attributes.pressure_class) },
  ];

  const allAttrDefs = [...sharedAttrs, ...faucetExtra, ...fittingExtra];
  const attrIds: Record<string, string> = {};

  for (const [i, a] of allAttrDefs.entries()) {
    const row = await prisma.attribute.upsert({
      where: { organizationId_code: { organizationId, code: a.code } },
      create: {
        organizationId,
        code: a.code,
        label: { en_US: a.label },
        type: a.type,
        groupId: group.id,
        sortOrder: 100 + i,
        options: (a.options || []) as object[],
        validationRules: (a.validationRules || {}) as object,
        localizable: Boolean(a.localizable),
      },
      update: {
        groupId: group.id,
        type: a.type,
        options: (a.options || []) as object[],
        validationRules: (a.validationRules || {}) as object,
      },
    });
    attrIds[a.code] = row.id;
  }

  const faucetFamily = await prisma.family.upsert({
    where: { organizationId_code: { organizationId, code: 'faucet' } },
    create: {
      organizationId,
      code: 'faucet',
      label: { en_US: 'Sink Faucets' },
      labelAttributeCode: 'product_title',
    },
    update: { labelAttributeCode: 'product_title' },
  });

  const fittingFamily = await prisma.family.upsert({
    where: { organizationId_code: { organizationId, code: 'fitting' } },
    create: {
      organizationId,
      code: 'fitting',
      label: { en_US: 'Pipe / Tube Fittings' },
      labelAttributeCode: 'product_title',
    },
    update: { labelAttributeCode: 'product_title' },
  });

  const faucetCodes = [
    'brand', 'manufacturer', 'mpn', 'classpath', 'part_desc_raw', 'finish', 'mounting',
    'handle_type', 'spout_type', 'faucet_material', 'connection_type', 'size',
    'invoice_desc', 'mobile_desc', 'product_title', 'long_description',
  ];
  const fittingCodes = [
    'brand', 'manufacturer', 'mpn', 'classpath', 'part_desc_raw', 'fitting_type',
    'fitting_material', 'connection_type', 'angle', 'pressure_class', 'size',
    'invoice_desc', 'mobile_desc', 'product_title', 'long_description',
  ];

  async function linkFamily(familyId: string, codes: string[]) {
    for (const [i, code] of codes.entries()) {
      const attributeId = attrIds[code];
      if (!attributeId) continue;
      await prisma.familyAttribute.upsert({
        where: { familyId_attributeId: { familyId, attributeId } },
        create: {
          familyId,
          attributeId,
          requiredForCompleteness: ['ecommerce'],
          sortOrder: i,
        },
        update: { sortOrder: i, requiredForCompleteness: ['ecommerce'] },
      });
    }
  }

  await linkFamily(faucetFamily.id, faucetCodes);
  await linkFamily(fittingFamily.id, fittingCodes);

  await prisma.category.upsert({
    where: { organizationId_code: { organizationId, code: 'sink-faucets' } },
    create: {
      organizationId,
      code: 'sink-faucets',
      label: { en_US: 'Sink Faucets' },
      sortOrder: 20,
      productCount: raw.filter((r) => r.familyHint === 'faucet').length,
    },
    update: {
      productCount: raw.filter((r) => r.familyHint === 'faucet').length,
    },
  });
  await prisma.category.upsert({
    where: { organizationId_code: { organizationId, code: 'pipe-fittings' } },
    create: {
      organizationId,
      code: 'pipe-fittings',
      label: { en_US: 'Pipe Fittings' },
      sortOrder: 21,
      productCount: raw.filter((r) => r.familyHint === 'fitting').length,
    },
    update: {
      productCount: raw.filter((r) => r.familyHint === 'fitting').length,
    },
  });

  let created = 0;
  for (const item of raw) {
    const familyId = item.familyHint === 'faucet' ? faucetFamily.id : fittingFamily.id;
    const brandHint = pickBrandHint(item);
    const values: Record<string, unknown> = {
      mpn: item.mfgPartNum,
      part_desc_raw: item.partDesc,
      // Intentionally sparse — enrichment fills the rest via Accept queue
      ...(brandHint ? {} : {}),
    };

    const product = await prisma.product.upsert({
      where: { organizationId_sku: { organizationId, sku: item.sku } },
      create: {
        organizationId,
        sku: item.sku,
        familyId,
        enabled: true,
        values,
        completeness: { ecommerce_en_US: 15 },
        geoScore: 20,
        searchText: `${item.sku} ${item.mfgPartNum} ${item.partDesc}`.toLowerCase(),
        updatedById: actorId,
      },
      update: {
        familyId,
        values,
        completeness: { ecommerce_en_US: 15 },
        geoScore: 20,
        searchText: `${item.sku} ${item.mfgPartNum} ${item.partDesc}`.toLowerCase(),
        enabled: true,
      },
    });

    const datasheet = [
      `MPN: ${item.mfgPartNum}`,
      `Part Description: ${item.partDesc}`,
      brandHint ? `Brand hint: ${brandHint}` : null,
      `E1_Brand: ${item.e1Brand}`,
      `Family: ${item.familyHint}`,
      '',
      `Manufacturer datasheet excerpt (synthetic).`,
      `Use approved LOV values and UOM standards when enriching.`,
    ]
      .filter(Boolean)
      .join('\n');

    const existingDoc = await prisma.sourceDocument.findFirst({
      where: {
        organizationId,
        productId: product.id,
        filename: `${item.sku}-datasheet.txt`,
      },
    });
    if (!existingDoc) {
      await prisma.sourceDocument.create({
        data: {
          organizationId,
          productId: product.id,
          type: SourceDocumentType.text_paste,
          rawContent: datasheet,
          filename: `${item.sku}-datasheet.txt`,
          fetchedAt: new Date(),
          status: SourceDocumentStatus.parsed,
        },
      });
    }
    created += 1;
  }

  return {
    products: created,
    faucetFamilyId: faucetFamily.id,
    fittingFamilyId: fittingFamily.id,
  };
}

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: 'kernle-demo' } });
  if (!org) {
    throw new Error('kernle-demo org missing — run pnpm db:seed first');
  }
  const owner = await prisma.user.findUnique({ where: { email: 'owner@kernle.local' } });
  const result = await seedUnilog(org.id, owner?.id);
  console.log('Unilog seed complete', result);
}

const invokedDirectly = process.argv[1]?.includes('seed-unilog');
if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
