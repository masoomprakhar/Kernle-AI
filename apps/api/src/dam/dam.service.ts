import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@kernle/db';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp') as typeof import('sharp');
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from './storage.service';

@Injectable()
export class DamService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  async list(
    organizationId: string,
    query: { search?: string; mimeType?: string; tag?: string; categoryId?: string; page?: number; pageSize?: number },
  ) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
    const where: Prisma.AssetWhereInput = {
      organizationId,
      ...(query.mimeType ? { mimeType: { startsWith: query.mimeType } } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { filename: { contains: query.search, mode: 'insensitive' } },
              { tags: { has: query.search } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        include: { productLinks: true, category: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((a) => ({
        ...a,
        url: this.storage.getSignedUrl(a.storageKey),
        thumbnailUrl: a.thumbnailKey ? this.storage.getSignedUrl(a.thumbnailKey) : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async upload(
    organizationId: string,
    actorId: string,
    file: Express.Multer.File,
    opts?: { tags?: string[]; categoryId?: string },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('File required');
    const key = await this.storage.makeUniqueKey(file.originalname);
    const stored = await this.storage.putObject(
      organizationId,
      key,
      file.buffer,
      file.mimetype,
    );

    let width: number | undefined;
    let height: number | undefined;
    let thumbnailKey: string | undefined;

    if (file.mimetype.startsWith('image/')) {
      try {
        const meta = await sharp(file.buffer).metadata();
        width = meta.width;
        height = meta.height;
        const thumb = await sharp(file.buffer)
          .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        const thumbStored = await this.storage.putObject(
          organizationId,
          `thumbs/${key}.jpg`,
          thumb,
          'image/jpeg',
        );
        thumbnailKey = thumbStored.storageKey;
      } catch {
        /* non-decodable image */
      }
    }

    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: stored.size,
        storageKey: stored.storageKey,
        width,
        height,
        thumbnailKey,
        tags: opts?.tags || [],
        categoryId: opts?.categoryId,
        metadata: {},
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'asset.upload',
      entityType: 'Asset',
      entityId: asset.id,
      after: { filename: asset.filename, size: asset.size, mimeType: asset.mimeType },
    });

    return {
      ...asset,
      url: this.storage.getSignedUrl(asset.storageKey),
      thumbnailUrl: asset.thumbnailKey ? this.storage.getSignedUrl(asset.thumbnailKey) : null,
    };
  }

  async get(organizationId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, organizationId },
      include: { productLinks: { include: { product: true } }, category: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    return {
      ...asset,
      url: this.storage.getSignedUrl(asset.storageKey),
      thumbnailUrl: asset.thumbnailKey ? this.storage.getSignedUrl(asset.thumbnailKey) : null,
    };
  }

  async update(
    organizationId: string,
    actorId: string,
    id: string,
    data: { tags?: string[]; categoryId?: string | null; metadata?: object },
  ) {
    const before = await this.prisma.asset.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Asset not found');
    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        tags: data.tags,
        categoryId: data.categoryId === undefined ? undefined : data.categoryId,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'asset.update',
      entityType: 'Asset',
      entityId: id,
      before,
      after: asset,
    });
    return asset;
  }

  async linkProduct(
    organizationId: string,
    actorId: string,
    assetId: string,
    data: { productId: string; role?: string; sortOrder?: number },
  ) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!asset) throw new NotFoundException('Asset not found');
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const link = await this.prisma.assetProductLink.upsert({
      where: {
        assetId_productId_role: {
          assetId,
          productId: data.productId,
          role: (data.role as any) || 'gallery',
        },
      },
      create: {
        assetId,
        productId: data.productId,
        role: (data.role as any) || 'gallery',
        sortOrder: data.sortOrder ?? 0,
      },
      update: { sortOrder: data.sortOrder ?? 0 },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'asset.link_product',
      entityType: 'Asset',
      entityId: assetId,
      after: link,
    });
    return link;
  }

  async unlinkProduct(organizationId: string, actorId: string, linkId: string) {
    const link = await this.prisma.assetProductLink.findUnique({
      where: { id: linkId },
      include: { asset: true },
    });
    if (!link || link.asset.organizationId !== organizationId) {
      throw new NotFoundException('Link not found');
    }
    await this.prisma.assetProductLink.delete({ where: { id: linkId } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'asset.unlink_product',
      entityType: 'Asset',
      entityId: link.assetId,
      before: link,
    });
    return { deleted: true };
  }

  /** Bulk zip export stub — returns asset list with signed URLs (no actual zip binary). */
  async exportZipStub(organizationId: string, assetIds: string[]) {
    const assets = await this.prisma.asset.findMany({
      where: { organizationId, id: { in: assetIds } },
    });
    return {
      stub: true,
      message: 'Zip packaging is stubbed; use listed signed URLs to download individually.',
      assets: assets.map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
        url: this.storage.getSignedUrl(a.storageKey, 7200),
      })),
    };
  }

  /**
   * AI tag/alt suggestions. Never auto-saves.
   * Mock when AI_MOCK=true or no ANTHROPIC_API_KEY.
   */
  async suggestTags(organizationId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, organizationId } });
    if (!asset) throw new NotFoundException('Asset not found');

    const useMock = process.env.AI_MOCK === 'true' || !process.env.ANTHROPIC_API_KEY;
    if (useMock) {
      const base = asset.filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      const tags = [base.split(' ')[0] || 'product', 'catalog', asset.mimeType.split('/')[0]].filter(
        Boolean,
      );
      const altText = `${base || 'Product'} image for catalog use`;
      return {
        mock: true,
        autoSaved: false,
        suggestions: { tags, altText },
        explanation: {
          schemaVersion: 1,
          explanationType: 'image_tag',
          reason: `Derived tags/alt from filename "${asset.filename}"`,
          excerpt: asset.filename,
          originLabel: 'image filename',
          needsAttention: false,
        },
        note: 'Suggestions only — accept explicitly to save. Never auto-applied.',
      };
    }

    // Lightweight non-mock path: still suggestion-only
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `Suggest 5 short product DAM tags and one alt text for file "${asset.filename}" (${asset.mimeType}). Reply JSON: {"tags":[],"altText":""}`,
          },
        ],
      });
      const text = resp.content
        .filter((b) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return {
        mock: false,
        autoSaved: false,
        suggestions: parsed,
        explanation: {
          schemaVersion: 1,
          explanationType: 'image_tag',
          reason: `Model-suggested tags/alt for "${asset.filename}"`,
          excerpt: asset.filename,
          originLabel: 'image analysis',
          needsAttention: false,
        },
      };
    } catch {
      return {
        mock: true,
        autoSaved: false,
        suggestions: {
          tags: ['product', 'image'],
          altText: asset.filename,
        },
        explanation: {
          schemaVersion: 1,
          explanationType: 'image_tag',
          reason: `Fallback tags from filename "${asset.filename}"`,
          excerpt: asset.filename,
          originLabel: 'image filename',
          needsAttention: false,
        },
        note: 'Fell back to mock suggestions. Not auto-saved.',
      };
    }
  }

  async readFile(storageKey: string, expires: string, sig: string) {
    if (!this.storage.verifySignedUrl(storageKey, expires, sig)) {
      throw new ForbiddenException('Invalid or expired signed URL');
    }
    const buf = await this.storage.getObject(decodeURIComponent(storageKey));
    return buf;
  }

  async delete(organizationId: string, actorId: string, id: string) {
    const before = await this.prisma.asset.findFirst({ where: { id, organizationId } });
    if (!before) throw new NotFoundException('Asset not found');
    await this.storage.deleteObject(before.storageKey);
    if (before.thumbnailKey) await this.storage.deleteObject(before.thumbnailKey);
    await this.prisma.asset.delete({ where: { id } });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'asset.delete',
      entityType: 'Asset',
      entityId: id,
      before,
    });
    return { deleted: true };
  }
}
