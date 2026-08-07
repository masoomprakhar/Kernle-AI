import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompletenessService } from './completeness.service';
import { BillingService } from '../billing/billing.service';

function requireOrg(organizationId?: string): string {
  if (!organizationId) throw new ForbiddenException('Organization context required');
  return organizationId;
}

@Injectable()
export class PimService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private completeness: CompletenessService,
    private billing: BillingService,
  ) {}

  // ─── Attributes ───────────────────────────────────────────

  listAttributes(organizationId: string, includeArchived = false) {
    return this.prisma.attribute.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { archived: false }),
      },
      include: { group: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async createAttribute(
    organizationId: string,
    actorId: string,
    data: {
      code: string;
      label: Record<string, string>;
      type: string;
      scopable?: boolean;
      localizable?: boolean;
      validationRules?: object;
      unit?: string;
      options?: unknown[];
      groupId?: string;
      sortOrder?: number;
    },
  ) {
    const exists = await this.prisma.attribute.findFirst({
      where: { organizationId, code: data.code },
    });
    if (exists) throw new BadRequestException(`Attribute code already exists: ${data.code}`);

    const attr = await this.prisma.attribute.create({
      data: {
        organizationId,
        code: data.code,
        label: data.label as Prisma.InputJsonValue,
        type: data.type as any,
        scopable: data.scopable ?? false,
        localizable: data.localizable ?? false,
        validationRules: (data.validationRules as Prisma.InputJsonValue) ?? {},
        unit: data.unit,
        options: (data.options as Prisma.InputJsonValue) ?? [],
        groupId: data.groupId,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'attribute.create',
      entityType: 'Attribute',
      entityId: attr.id,
      after: attr,
    });
    return attr;
  }

  async updateAttribute(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{
      label: Record<string, string>;
      validationRules: object;
      unit: string;
      options: unknown[];
      groupId: string | null;
      sortOrder: number;
      archived: boolean;
      scopable: boolean;
      localizable: boolean;
    }>,
  ) {
    const before = await this.prisma.attribute.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Attribute not found');
    const attr = await this.prisma.attribute.update({
      where: { id },
      data: {
        label: data.label as Prisma.InputJsonValue | undefined,
        validationRules: data.validationRules as Prisma.InputJsonValue | undefined,
        unit: data.unit,
        options: data.options as Prisma.InputJsonValue | undefined,
        groupId: data.groupId === undefined ? undefined : data.groupId,
        sortOrder: data.sortOrder,
        archived: data.archived,
        scopable: data.scopable,
        localizable: data.localizable,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'attribute.update',
      entityType: 'Attribute',
      entityId: id,
      before,
      after: attr,
    });
    return attr;
  }

  async deleteAttribute(organizationId: string, actorId: string, id: string) {
    const before = await this.prisma.attribute.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Attribute not found');
    const attr = await this.prisma.attribute.update({
      where: { id },
      data: { archived: true },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'attribute.archive',
      entityType: 'Attribute',
      entityId: id,
      before,
      after: attr,
    });
    return attr;
  }

  // ─── Attribute Groups ─────────────────────────────────────

  listAttributeGroups(organizationId: string) {
    return this.prisma.attributeGroup.findMany({
      where: { organizationId },
      include: { attributes: { where: { archived: false }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createAttributeGroup(
    organizationId: string,
    actorId: string,
    data: { code: string; label: Record<string, string>; sortOrder?: number },
  ) {
    const group = await this.prisma.attributeGroup.create({
      data: {
        organizationId,
        code: data.code,
        label: data.label as Prisma.InputJsonValue,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'attribute_group.create',
      entityType: 'AttributeGroup',
      entityId: group.id,
      after: group,
    });
    return group;
  }

  async updateAttributeGroup(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{ code: string; label: Record<string, string>; sortOrder: number }>,
  ) {
    const before = await this.prisma.attributeGroup.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Attribute group not found');
    const group = await this.prisma.attributeGroup.update({
      where: { id },
      data: {
        code: data.code,
        label: data.label as Prisma.InputJsonValue | undefined,
        sortOrder: data.sortOrder,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'attribute_group.update',
      entityType: 'AttributeGroup',
      entityId: id,
      before,
      after: group,
    });
    return group;
  }

  async deleteAttributeGroup(organizationId: string, actorId: string, id: string) {
    const before = await this.prisma.attributeGroup.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Attribute group not found');
    await this.prisma.attribute.updateMany({ where: { groupId: id }, data: { groupId: null } });
    await this.prisma.attributeGroup.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'attribute_group.delete',
      entityType: 'AttributeGroup',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  // ─── Families ─────────────────────────────────────────────

  listFamilies(organizationId: string) {
    return this.prisma.family.findMany({
      where: { organizationId },
      include: {
        attributes: { include: { attribute: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { products: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getFamily(organizationId: string, id: string) {
    const family = await this.prisma.family.findFirst({
      where: { id, organizationId },
      include: {
        attributes: { include: { attribute: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!family) throw new NotFoundException('Family not found');
    return family;
  }

  async createFamily(
    organizationId: string,
    actorId: string,
    data: {
      code: string;
      label: Record<string, string>;
      labelAttributeCode?: string;
      attributes?: Array<{
        attributeId: string;
        requiredForCompleteness?: Array<{ channel: string; locale: string }>;
        sortOrder?: number;
      }>;
    },
  ) {
    const exists = await this.prisma.family.findFirst({
      where: { organizationId, code: data.code },
    });
    if (exists) throw new BadRequestException(`Family code already exists: ${data.code}`);

    const family = await this.prisma.family.create({
      data: {
        organizationId,
        code: data.code,
        label: data.label as Prisma.InputJsonValue,
        labelAttributeCode: data.labelAttributeCode,
        attributes: data.attributes?.length
          ? {
              create: data.attributes.map((a, i) => ({
                attributeId: a.attributeId,
                requiredForCompleteness: (a.requiredForCompleteness || []) as Prisma.InputJsonValue,
                sortOrder: a.sortOrder ?? i,
              })),
            }
          : undefined,
      },
      include: { attributes: { include: { attribute: true } } },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'family.create',
      entityType: 'Family',
      entityId: family.id,
      after: family,
    });
    return family;
  }

  async updateFamily(
    organizationId: string,
    actorId: string,
    id: string,
    data: {
      label?: Record<string, string>;
      labelAttributeCode?: string;
      attributes?: Array<{
        attributeId: string;
        requiredForCompleteness?: Array<{ channel: string; locale: string }>;
        sortOrder?: number;
      }>;
    },
  ) {
    const before = await this.getFamily(organizationId, id);
    if (data.attributes) {
      await this.prisma.familyAttribute.deleteMany({ where: { familyId: id } });
      await this.prisma.familyAttribute.createMany({
        data: data.attributes.map((a, i) => ({
          familyId: id,
          attributeId: a.attributeId,
          requiredForCompleteness: (a.requiredForCompleteness || []) as Prisma.InputJsonValue,
          sortOrder: a.sortOrder ?? i,
        })),
      });
    }
    const family = await this.prisma.family.update({
      where: { id },
      data: {
        label: data.label as Prisma.InputJsonValue | undefined,
        labelAttributeCode: data.labelAttributeCode,
      },
      include: { attributes: { include: { attribute: true }, orderBy: { sortOrder: 'asc' } } },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'family.update',
      entityType: 'Family',
      entityId: id,
      before,
      after: family,
    });
    return family;
  }

  async deleteFamily(organizationId: string, actorId: string, id: string) {
    const before = await this.getFamily(organizationId, id);
    const productCount = await this.prisma.product.count({ where: { familyId: id } });
    if (productCount > 0) {
      throw new BadRequestException('Cannot delete family with products; reassign products first');
    }
    await this.prisma.family.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'family.delete',
      entityType: 'Family',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  // ─── Categories ───────────────────────────────────────────

  async listCategories(organizationId: string, asTree = true) {
    const cats = await this.prisma.category.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    if (!asTree) return cats;
    type Node = (typeof cats)[0] & { children: Node[] };
    const map = new Map<string, Node>();
    cats.forEach((c) => map.set(c.id, { ...c, children: [] }));
    const roots: Node[] = [];
    for (const c of map.values()) {
      if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.children.push(c);
      else roots.push(c);
    }
    return roots;
  }

  async createCategory(
    organizationId: string,
    actorId: string,
    data: {
      code: string;
      label: Record<string, string>;
      parentId?: string;
      sortOrder?: number;
    },
  ) {
    if (data.parentId) {
      const parent = await this.prisma.category.findFirst({
        where: { id: data.parentId, organizationId },
      });
      if (!parent) throw new BadRequestException('Parent category not found');
    }
    const cat = await this.prisma.category.create({
      data: {
        organizationId,
        code: data.code,
        label: data.label as Prisma.InputJsonValue,
        parentId: data.parentId,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'category.create',
      entityType: 'Category',
      entityId: cat.id,
      after: cat,
    });
    return cat;
  }

  async updateCategory(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{
      label: Record<string, string>;
      parentId: string | null;
      sortOrder: number;
    }>,
  ) {
    const before = await this.prisma.category.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Category not found');
    if (data.parentId === id) throw new BadRequestException('Category cannot be its own parent');
    const cat = await this.prisma.category.update({
      where: { id },
      data: {
        label: data.label as Prisma.InputJsonValue | undefined,
        parentId: data.parentId === undefined ? undefined : data.parentId,
        sortOrder: data.sortOrder,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'category.update',
      entityType: 'Category',
      entityId: id,
      before,
      after: cat,
    });
    return cat;
  }

  async reorderCategories(
    organizationId: string,
    actorId: string,
    items: Array<{ id: string; sortOrder: number; parentId?: string | null }>,
  ) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.updateMany({
          where: { id: item.id, organizationId },
          data: {
            sortOrder: item.sortOrder,
            ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
          },
        }),
      ),
    );
    await this.audit.log({
      organizationId,
      actorId,
      action: 'category.reorder',
      entityType: 'Category',
      after: items,
    });
    return this.listCategories(organizationId, true);
  }

  async bulkMoveProducts(
    organizationId: string,
    actorId: string,
    data: { productIds: string[]; categoryId: string; mode?: 'add' | 'replace' },
  ) {
    const category = await this.prisma.category.findFirst({
      where: { id: data.categoryId, organizationId },
    });
    if (!category) throw new NotFoundException('Category not found');
    const products = await this.prisma.product.findMany({
      where: { organizationId, id: { in: data.productIds } },
      select: { id: true },
    });
    const ids = products.map((p) => p.id);
    if (data.mode === 'replace') {
      await this.prisma.productCategory.deleteMany({ where: { productId: { in: ids } } });
    }
    await this.prisma.productCategory.createMany({
      data: ids.map((productId) => ({ productId, categoryId: data.categoryId })),
      skipDuplicates: true,
    });
    await this.refreshCategoryCounts(organizationId);
    await this.audit.log({
      organizationId,
      actorId,
      action: 'category.bulk_move_products',
      entityType: 'Category',
      entityId: data.categoryId,
      after: { productIds: ids, mode: data.mode || 'add' },
    });
    return { moved: ids.length };
  }

  async deleteCategory(organizationId: string, actorId: string, id: string) {
    const before = await this.prisma.category.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Category not found');
    await this.prisma.category.delete({ where: { id } });
    await this.refreshCategoryCounts(organizationId);
    await this.audit.log({
      organizationId,
      actorId,
      action: 'category.delete',
      entityType: 'Category',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  private async refreshCategoryCounts(organizationId: string) {
    const cats = await this.prisma.category.findMany({
      where: { organizationId },
      select: { id: true },
    });
    for (const c of cats) {
      const productCount = await this.prisma.productCategory.count({ where: { categoryId: c.id } });
      await this.prisma.category.update({ where: { id: c.id }, data: { productCount } });
    }
  }

  // ─── Products ─────────────────────────────────────────────

  async listProducts(
    organizationId: string,
    query: {
      page?: number;
      pageSize?: number;
      search?: string;
      familyId?: string;
      enabled?: boolean;
      categoryId?: string;
      minCompleteness?: number;
      channel?: string;
      locale?: string;
    },
  ) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(query.familyId ? { familyId: query.familyId } : {}),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' } },
              { searchText: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          family: true,
          categories: { include: { category: true } },
          assetLinks: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    let filtered = items;
    if (query.minCompleteness !== undefined && query.channel && query.locale) {
      const key = `${query.channel}|${query.locale}`;
      filtered = items.filter((p) => {
        const c = (p.completeness as Record<string, number>) || {};
        return (c[key] ?? 0) >= query.minCompleteness!;
      });
    }

    return { items: filtered, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async getProduct(organizationId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
      include: {
        family: { include: { attributes: { include: { attribute: true } } } },
        categories: { include: { category: true } },
        assetLinks: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
        productModel: true,
        comments: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async createProduct(
    organizationId: string,
    actorId: string,
    data: {
      sku: string;
      familyId?: string;
      productModelId?: string;
      enabled?: boolean;
      values?: Record<string, any>;
      categoryIds?: string[];
    },
  ) {
    await this.billing.assertSkuLimit(organizationId);
    const existing = await this.prisma.product.findFirst({
      where: { organizationId, sku: data.sku },
    });
    if (existing) throw new BadRequestException(`SKU already exists: ${data.sku}`);

    const product = await this.prisma.product.create({
      data: {
        organizationId,
        sku: data.sku,
        familyId: data.familyId,
        productModelId: data.productModelId,
        enabled: data.enabled ?? true,
        values: (data.values || {}) as Prisma.InputJsonValue,
        updatedById: actorId,
        categories: data.categoryIds?.length
          ? { create: data.categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
    });
    await this.completeness.refreshProduct(product.id);
    const refreshed = await this.getProduct(organizationId, product.id);
    await this.audit.log({
      organizationId,
      actorId,
      action: 'product.create',
      entityType: 'Product',
      entityId: product.id,
      after: refreshed,
    });
    if (data.categoryIds?.length) await this.refreshCategoryCounts(organizationId);
    return refreshed;
  }

  async updateProductValues(
    organizationId: string,
    actorId: string,
    id: string,
    data: {
      values?: Record<string, any>;
      merge?: boolean;
      familyId?: string;
      enabled?: boolean;
      sku?: string;
    },
  ) {
    const before = await this.getProduct(organizationId, id);
    let nextValues = (before.values as Record<string, any>) || {};
    if (data.values) {
      nextValues = data.merge === false ? data.values : { ...nextValues, ...data.values };
    }
    await this.prisma.product.update({
      where: { id },
      data: {
        values: nextValues as Prisma.InputJsonValue,
        familyId: data.familyId,
        enabled: data.enabled,
        sku: data.sku,
        updatedById: actorId,
      },
    });
    await this.completeness.refreshProduct(id);
    const after = await this.getProduct(organizationId, id);
    await this.audit.log({
      organizationId,
      actorId,
      action: 'product.update',
      entityType: 'Product',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async bulkSetEnabled(
    organizationId: string,
    actorId: string,
    productIds: string[],
    enabled: boolean,
  ) {
    const result = await this.prisma.product.updateMany({
      where: { organizationId, id: { in: productIds } },
      data: { enabled, updatedById: actorId },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: enabled ? 'product.bulk_enable' : 'product.bulk_disable',
      entityType: 'Product',
      after: { productIds, count: result.count },
    });
    return result;
  }

  async assignCategories(
    organizationId: string,
    actorId: string,
    productId: string,
    categoryIds: string[],
    mode: 'replace' | 'add' = 'replace',
  ) {
    await this.getProduct(organizationId, productId);
    if (mode === 'replace') {
      await this.prisma.productCategory.deleteMany({ where: { productId } });
    }
    await this.prisma.productCategory.createMany({
      data: categoryIds.map((categoryId) => ({ productId, categoryId })),
      skipDuplicates: true,
    });
    await this.refreshCategoryCounts(organizationId);
    await this.audit.log({
      organizationId,
      actorId,
      action: 'product.assign_categories',
      entityType: 'Product',
      entityId: productId,
      after: { categoryIds, mode },
    });
    return this.getProduct(organizationId, productId);
  }

  async deleteProduct(organizationId: string, actorId: string, id: string) {
    const before = await this.getProduct(organizationId, id);
    await this.prisma.product.delete({ where: { id } });
    await this.refreshCategoryCounts(organizationId);
    await this.audit.log({
      organizationId,
      actorId,
      action: 'product.delete',
      entityType: 'Product',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  // ─── Product Models ───────────────────────────────────────

  listProductModels(organizationId: string) {
    return this.prisma.productModel.findMany({
      where: { organizationId },
      include: {
        family: true,
        variants: { select: { id: true, sku: true, enabled: true, values: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async createProductModel(
    organizationId: string,
    actorId: string,
    data: {
      code: string;
      familyId: string;
      variantAxes: string[];
      sharedValues?: Record<string, any>;
    },
  ) {
    const family = await this.prisma.family.findFirst({
      where: { id: data.familyId, organizationId },
    });
    if (!family) throw new BadRequestException('Family not found');
    const model = await this.prisma.productModel.create({
      data: {
        organizationId,
        code: data.code,
        familyId: data.familyId,
        variantAxes: data.variantAxes,
        sharedValues: (data.sharedValues || {}) as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'product_model.create',
      entityType: 'ProductModel',
      entityId: model.id,
      after: model,
    });
    return model;
  }

  async updateProductModel(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{
      variantAxes: string[];
      sharedValues: Record<string, any>;
      familyId: string;
    }>,
  ) {
    const before = await this.prisma.productModel.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Product model not found');
    const model = await this.prisma.productModel.update({
      where: { id },
      data: {
        variantAxes: data.variantAxes,
        sharedValues: data.sharedValues as Prisma.InputJsonValue | undefined,
        familyId: data.familyId,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'product_model.update',
      entityType: 'ProductModel',
      entityId: id,
      before,
      after: model,
    });
    return model;
  }

  /**
   * Generate variant products from cartesian product of select-option axes.
   */
  async generateVariants(organizationId: string, actorId: string, modelId: string) {
    const model = await this.prisma.productModel.findFirst({
      where: { id: modelId, organizationId },
      include: { family: true },
    });
    if (!model) throw new NotFoundException('Product model not found');
    if (!model.variantAxes.length) {
      throw new BadRequestException('Product model has no variant axes');
    }

    const axisAttrs = await this.prisma.attribute.findMany({
      where: {
        organizationId,
        code: { in: model.variantAxes },
        type: { in: ['select', 'multiselect'] },
      },
    });
    if (axisAttrs.length !== model.variantAxes.length) {
      throw new BadRequestException('All variant axes must be select/multiselect attributes');
    }

    const optionLists = model.variantAxes.map((code) => {
      const attr = axisAttrs.find((a) => a.code === code)!;
      const options = (attr.options as Array<string | { code: string; label?: unknown }>) || [];
      return options.map((o) => (typeof o === 'string' ? o : o.code));
    });

    if (optionLists.some((l) => l.length === 0)) {
      throw new BadRequestException('Variant axes must have options');
    }

    const combos = cartesian(optionLists);
    const created: string[] = [];
    const skipped: string[] = [];

    for (const combo of combos) {
      const axisValues: Record<string, any> = {};
      const skuParts = [model.code];
      model.variantAxes.forEach((code, i) => {
        const opt = combo[i];
        axisValues[code] = { '<all_channels>': { '<all_locales>': opt } };
        skuParts.push(opt);
      });
      const sku = skuParts.join('-').replace(/\s+/g, '_').slice(0, 120);
      const existing = await this.prisma.product.findFirst({ where: { organizationId, sku } });
      if (existing) {
        skipped.push(sku);
        continue;
      }
      await this.billing.assertSkuLimit(organizationId);
      const shared = (model.sharedValues as Record<string, any>) || {};
      const product = await this.prisma.product.create({
        data: {
          organizationId,
          sku,
          familyId: model.familyId,
          productModelId: model.id,
          values: { ...shared, ...axisValues } as Prisma.InputJsonValue,
          updatedById: actorId,
        },
      });
      await this.completeness.refreshProduct(product.id);
      created.push(product.id);
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: 'product_model.generate_variants',
      entityType: 'ProductModel',
      entityId: modelId,
      after: { created: created.length, skipped: skipped.length },
    });
    return { created: created.length, skipped, productIds: created };
  }

  // ─── Channels & Locales ───────────────────────────────────

  listChannels(organizationId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId },
      orderBy: { code: 'asc' },
    });
  }

  async createChannel(
    organizationId: string,
    actorId: string,
    data: {
      code: string;
      label: string;
      locales?: string[];
      categoryTreeId?: string;
      connectorType?: string;
      credentialsEnc?: string;
      fieldMapping?: object;
      categoryMapping?: object;
      autoSync?: boolean;
    },
  ) {
    await this.billing.assertChannelLimit(organizationId);
    const channel = await this.prisma.channel.create({
      data: {
        organizationId,
        code: data.code,
        label: data.label,
        locales: data.locales || [],
        categoryTreeId: data.categoryTreeId,
        connectorType: data.connectorType as any,
        credentialsEnc: data.credentialsEnc,
        fieldMapping: (data.fieldMapping as Prisma.InputJsonValue) ?? {},
        categoryMapping: (data.categoryMapping as Prisma.InputJsonValue) ?? {},
        autoSync: data.autoSync ?? true,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'channel.create',
      entityType: 'Channel',
      entityId: channel.id,
      after: { ...channel, credentialsEnc: channel.credentialsEnc ? '[redacted]' : null },
    });
    return channel;
  }

  async updateChannel(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{
      label: string;
      locales: string[];
      categoryTreeId: string | null;
      activationStatus: string;
      connectorType: string | null;
      credentialsEnc: string | null;
      fieldMapping: object;
      categoryMapping: object;
      autoSync: boolean;
      paused: boolean;
    }>,
  ) {
    const before = await this.prisma.channel.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Channel not found');
    const channel = await this.prisma.channel.update({
      where: { id },
      data: {
        label: data.label,
        locales: data.locales,
        categoryTreeId: data.categoryTreeId === undefined ? undefined : data.categoryTreeId,
        activationStatus: data.activationStatus,
        connectorType: data.connectorType as any,
        credentialsEnc: data.credentialsEnc === undefined ? undefined : data.credentialsEnc,
        fieldMapping: data.fieldMapping as Prisma.InputJsonValue | undefined,
        categoryMapping: data.categoryMapping as Prisma.InputJsonValue | undefined,
        autoSync: data.autoSync,
        paused: data.paused,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'channel.update',
      entityType: 'Channel',
      entityId: id,
      before: { ...before, credentialsEnc: before.credentialsEnc ? '[redacted]' : null },
      after: { ...channel, credentialsEnc: channel.credentialsEnc ? '[redacted]' : null },
    });
    return channel;
  }

  listLocales(organizationId: string) {
    return this.prisma.locale.findMany({
      where: { organizationId },
      orderBy: { code: 'asc' },
    });
  }

  async createLocale(
    organizationId: string,
    actorId: string,
    data: { code: string; label: string; enabled?: boolean },
  ) {
    const locale = await this.prisma.locale.create({
      data: {
        organizationId,
        code: data.code,
        label: data.label,
        enabled: data.enabled ?? true,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'locale.create',
      entityType: 'Locale',
      entityId: locale.id,
      after: locale,
    });
    return locale;
  }

  async updateLocale(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{ label: string; enabled: boolean }>,
  ) {
    const before = await this.prisma.locale.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Locale not found');
    const locale = await this.prisma.locale.update({
      where: { id },
      data: { label: data.label, enabled: data.enabled },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'locale.update',
      entityType: 'Locale',
      entityId: id,
      before,
      after: locale,
    });
    return locale;
  }

  async recomputeCompleteness(organizationId: string, productId: string) {
    await this.getProduct(organizationId, productId);
    return this.completeness.refreshProduct(productId);
  }
}

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap((a) => curr.map((c) => [...a, c])),
    [[]],
  );
}

export { requireOrg };
