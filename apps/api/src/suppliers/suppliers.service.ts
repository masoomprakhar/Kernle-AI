import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompletenessService } from '../pim/completeness.service';

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private completeness: CompletenessService,
  ) {}

  list(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { submissions: true } } },
    });
  }

  async create(
    organizationId: string,
    actorId: string,
    data: {
      name: string;
      contactEmail?: string;
      contactInfo?: object;
      categoryIds?: string[];
    },
  ) {
    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId,
        name: data.name,
        contactEmail: data.contactEmail,
        contactInfo: (data.contactInfo || {}) as Prisma.InputJsonValue,
        categoryIds: data.categoryIds || [],
        portalAccessToken: randomBytes(24).toString('hex'),
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'supplier.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      after: { ...supplier, portalAccessToken: '[issued]' },
    });
    return supplier;
  }

  async update(
    organizationId: string,
    actorId: string,
    id: string,
    data: Partial<{
      name: string;
      contactEmail: string;
      contactInfo: object;
      categoryIds: string[];
      rotateToken: boolean;
    }>,
  ) {
    const before = await this.prisma.supplier.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Supplier not found');
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        contactEmail: data.contactEmail,
        contactInfo: data.contactInfo as Prisma.InputJsonValue | undefined,
        categoryIds: data.categoryIds,
        ...(data.rotateToken ? { portalAccessToken: randomBytes(24).toString('hex') } : {}),
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'supplier.update',
      entityType: 'Supplier',
      entityId: id,
      before: { ...before, portalAccessToken: '[redacted]' },
      after: { ...supplier, portalAccessToken: data.rotateToken ? '[rotated]' : '[redacted]' },
    });
    return supplier;
  }

  async delete(organizationId: string, actorId: string, id: string) {
    const before = await this.prisma.supplier.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Supplier not found');
    await this.prisma.supplier.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'supplier.delete',
      entityType: 'Supplier',
      entityId: id,
      before: { ...before, portalAccessToken: '[redacted]' },
    });
    return { deleted: true };
  }

  private async supplierByToken(token: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { portalAccessToken: token } });
    if (!supplier) throw new UnauthorizedException('Invalid portal token');
    return supplier;
  }

  /** Portal: list products assigned via supplier.categoryIds (no JWT). */
  async portalListProducts(token: string) {
    const supplier = await this.supplierByToken(token);
    if (!supplier.categoryIds.length) {
      return { supplier: { id: supplier.id, name: supplier.name }, products: [] };
    }
    const products = await this.prisma.product.findMany({
      where: {
        organizationId: supplier.organizationId,
        categories: { some: { categoryId: { in: supplier.categoryIds } } },
      },
      select: {
        id: true,
        sku: true,
        enabled: true,
        values: true,
        completeness: true,
        family: { select: { code: true, label: true } },
        categories: { include: { category: { select: { id: true, code: true, label: true } } } },
      },
      take: 500,
    });
    return {
      supplier: { id: supplier.id, name: supplier.name, categoryIds: supplier.categoryIds },
      products,
    };
  }

  async portalSubmit(token: string, data: { productSku: string; submittedValues: Record<string, any> }) {
    const supplier = await this.supplierByToken(token);
    if (!data.productSku) throw new BadRequestException('productSku required');
    const product = await this.prisma.product.findFirst({
      where: { organizationId: supplier.organizationId, sku: data.productSku },
      include: { categories: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    const assigned = product.categories.some((c) => supplier.categoryIds.includes(c.categoryId));
    if (!assigned && supplier.categoryIds.length) {
      throw new ForbiddenException('Product not in supplier category assignment');
    }

    const submission = await this.prisma.supplierSubmission.create({
      data: {
        supplierId: supplier.id,
        productSku: data.productSku,
        submittedValues: (data.submittedValues || {}) as Prisma.InputJsonValue,
        status: 'pending_review',
      },
    });
    return { submission, message: 'Submitted for review' };
  }

  listReviewQueue(organizationId: string, status?: string) {
    return this.prisma.supplierSubmission.findMany({
      where: {
        supplier: { organizationId },
        ...(status ? { status: status as any } : { status: 'pending_review' }),
      },
      include: { supplier: true, reviewedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async approve(organizationId: string, actorId: string, submissionId: string, note?: string) {
    const submission = await this.prisma.supplierSubmission.findUnique({
      where: { id: submissionId },
      include: { supplier: true },
    });
    if (!submission || submission.supplier.organizationId !== organizationId) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.status !== 'pending_review') {
      throw new BadRequestException('Submission already reviewed');
    }

    const product = await this.prisma.product.findFirst({
      where: { organizationId, sku: submission.productSku },
    });
    if (!product) throw new NotFoundException(`Product ${submission.productSku} not found`);

    const submitted = (submission.submittedValues as Record<string, any>) || {};
    const merged = { ...((product.values as Record<string, any>) || {}), ...submitted };
    await this.prisma.product.update({
      where: { id: product.id },
      data: { values: merged as Prisma.InputJsonValue, updatedById: actorId },
    });
    await this.completeness.refreshProduct(product.id);

    const updated = await this.prisma.supplierSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'approved',
        reviewedById: actorId,
        reviewNote: note,
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'supplier_submission.approve',
      entityType: 'SupplierSubmission',
      entityId: submissionId,
      after: { productSku: submission.productSku, productId: product.id },
    });
    return updated;
  }

  async reject(organizationId: string, actorId: string, submissionId: string, note?: string) {
    const submission = await this.prisma.supplierSubmission.findUnique({
      where: { id: submissionId },
      include: { supplier: true },
    });
    if (!submission || submission.supplier.organizationId !== organizationId) {
      throw new NotFoundException('Submission not found');
    }
    const updated = await this.prisma.supplierSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'rejected',
        reviewedById: actorId,
        reviewNote: note,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'supplier_submission.reject',
      entityType: 'SupplierSubmission',
      entityId: submissionId,
      after: { note },
    });
    return updated;
  }
}
