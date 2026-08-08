import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { Prisma, SourceDocumentStatus, SourceDocumentType } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { CompletenessService } from '../pim/completeness.service';
import { QueueService } from '../queues/queue.service';
import { StorageService } from '../dam/storage.service';
import { fetchUrlContent } from './url-content';
import { attributesForExtraction } from './extract-logic';
import { extractWithConflicts } from './conflict';

const EXTRACT_QUEUE = 'ai.source_extract';

@Injectable()
export class IntelligenceService implements OnModuleInit {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(forwardRef(() => BillingService)) private billing: BillingService,
    private completeness: CompletenessService,
    private queues: QueueService,
    private storage: StorageService,
  ) {}

  onModuleInit() {
    this.queues.registerHandler(EXTRACT_QUEUE, async (data) => {
      const payload = data as {
        organizationId: string;
        actorId: string;
        productId: string;
        familyId: string;
        sourceDocumentIds: string[];
        _alreadyRan?: boolean;
      };
      if (payload._alreadyRan) return;
      await this.runExtraction(payload);
    });
  }

  private useMock() {
    return process.env.AI_MOCK === 'true' || !process.env.ANTHROPIC_API_KEY;
  }

  listSources(organizationId: string, productId?: string) {
    return this.prisma.sourceDocument.findMany({
      where: {
        organizationId,
        ...(productId ? { productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createTextSource(
    organizationId: string,
    actorId: string,
    text: string,
    productId?: string,
  ) {
    if (!text?.trim()) throw new BadRequestException('text is required');
    if (productId) await this.assertProduct(organizationId, productId);

    const doc = await this.prisma.sourceDocument.create({
      data: {
        organizationId,
        productId,
        type: SourceDocumentType.text_paste,
        rawContent: text.trim().slice(0, 200_000),
        fetchedAt: new Date(),
        status: SourceDocumentStatus.parsed,
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'intelligence.source_create',
      entityType: 'SourceDocument',
      entityId: doc.id,
      after: { type: doc.type },
    });
    return doc;
  }

  async createUrlSource(
    organizationId: string,
    actorId: string,
    url: string,
    productId?: string,
  ) {
    if (!url?.trim()) throw new BadRequestException('url is required');
    if (productId) await this.assertProduct(organizationId, productId);

    const doc = await this.prisma.sourceDocument.create({
      data: {
        organizationId,
        productId,
        type: SourceDocumentType.url,
        rawContent: url.trim(),
        status: SourceDocumentStatus.pending,
      },
    });

    try {
      if (this.useMock() && /mock|example\.com|localhost/i.test(url)) {
        const mockBody = [
          'Air Runner Pro',
          '',
          'Name: Air Runner Pro',
          'Color: Trail Blue',
          'Material: Mesh + EVA',
          'Price: 129',
          '',
          'Lightweight trail shoe designed for all-day comfort on mixed terrain.',
        ].join('\n');
        const updated = await this.prisma.sourceDocument.update({
          where: { id: doc.id },
          data: {
            rawContent: `URL: ${url.trim()}\n\n${mockBody}`,
            fetchedAt: new Date(),
            status: SourceDocumentStatus.parsed,
          },
        });
        return updated;
      }

      const { text, title } = await fetchUrlContent(url.trim());
      const raw = [title ? `Title: ${title}` : null, `URL: ${url.trim()}`, '', text]
        .filter(Boolean)
        .join('\n');
      return this.prisma.sourceDocument.update({
        where: { id: doc.id },
        data: {
          rawContent: raw.slice(0, 200_000),
          fetchedAt: new Date(),
          status: SourceDocumentStatus.parsed,
        },
      });
    } catch (err) {
      return this.prisma.sourceDocument.update({
        where: { id: doc.id },
        data: {
          status: SourceDocumentStatus.failed,
          errorMessage: (err as Error).message,
        },
      });
    }
  }

  async createFileSource(
    organizationId: string,
    actorId: string,
    file: Express.Multer.File,
    productId?: string,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('File required');
    if (productId) await this.assertProduct(organizationId, productId);

    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    const isImage = file.mimetype.startsWith('image/');
    if (!isPdf && !isImage) {
      throw new BadRequestException('Only PDF or image uploads are supported');
    }

    const key = await this.storage.makeUniqueKey(file.originalname);
    const stored = await this.storage.putObject(
      organizationId,
      `sources/${key}`,
      file.buffer,
      file.mimetype,
    );

    let rawContent: string;
    if (this.useMock()) {
      rawContent = [
        `File: ${file.originalname}`,
        'Name: Spec Sheet Draft',
        'Color: Graphite',
        'Material: Recycled polyester',
        'Price: 89',
        '',
        'Manufacturer specification sheet (mock extract).',
      ].join('\n');
    } else if (isPdf) {
      // Lightweight text sniff — full PDF parse deferred; keep evidence via storageKey
      const sniff = file.buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
      const readable = sniff.replace(/\s+/g, ' ').trim().slice(0, 20_000);
      rawContent = readable.length > 40
        ? `File: ${file.originalname}\n\n${readable}`
        : `File: ${file.originalname}\n\n[PDF stored; limited text layer available]`;
    } else {
      rawContent = `Image: ${file.originalname}`;
    }

    const doc = await this.prisma.sourceDocument.create({
      data: {
        organizationId,
        productId,
        type: isPdf ? SourceDocumentType.pdf : SourceDocumentType.image,
        storageKey: stored.storageKey,
        filename: file.originalname,
        rawContent,
        fetchedAt: new Date(),
        status: SourceDocumentStatus.parsed,
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'intelligence.source_upload',
      entityType: 'SourceDocument',
      entityId: doc.id,
      after: { type: doc.type, filename: file.originalname },
    });
    return doc;
  }

  /**
   * Create draft product if needed, attach sources, enqueue extraction.
   */
  async startExtraction(
    organizationId: string,
    actorId: string,
    input: {
      familyId: string;
      sourceDocumentIds: string[];
      productId?: string;
      sku?: string;
    },
  ) {
    await this.billing.assertAiCredits(organizationId);

    if (!input.sourceDocumentIds?.length) {
      throw new BadRequestException('At least one sourceDocumentId is required');
    }

    const family = await this.prisma.family.findFirst({
      where: { id: input.familyId, organizationId },
      include: { attributes: { include: { attribute: true } } },
    });
    if (!family) throw new NotFoundException('Family not found');

    const sources = await this.prisma.sourceDocument.findMany({
      where: {
        organizationId,
        id: { in: input.sourceDocumentIds },
      },
    });
    if (sources.length !== input.sourceDocumentIds.length) {
      throw new BadRequestException('One or more source documents not found');
    }
    if (sources.some((s) => s.status === SourceDocumentStatus.failed)) {
      throw new BadRequestException('Cannot extract from failed source documents');
    }

    let productId = input.productId;
    if (productId) {
      await this.assertProduct(organizationId, productId);
    } else {
      const sku =
        input.sku?.trim() ||
        `SRC-${Date.now().toString(36).toUpperCase()}`;
      const existing = await this.prisma.product.findFirst({
        where: { organizationId, sku },
      });
      if (existing) throw new BadRequestException(`SKU already exists: ${sku}`);

      const product = await this.prisma.product.create({
        data: {
          organizationId,
          sku,
          familyId: family.id,
          values: {},
          searchText: sku,
          updatedById: actorId,
        },
      });
      productId = product.id;
      await this.completeness.refreshProduct(product.id);
    }

    await this.prisma.sourceDocument.updateMany({
      where: { organizationId, id: { in: input.sourceDocumentIds } },
      data: { productId },
    });

    const jobPayload = {
      organizationId,
      actorId,
      productId: productId!,
      familyId: family.id,
      sourceDocumentIds: input.sourceDocumentIds,
    };

    // Always extract inline for responsive wizard UX. When BullMQ is connected,
    // also record a no-op job (worker skips via _alreadyRan).
    await this.runExtraction(jobPayload);
    const job = await this.queues.enqueue(
      EXTRACT_QUEUE,
      { ...jobPayload, _alreadyRan: true },
      { awaitInline: true },
    );

    await this.audit.log({
      organizationId,
      actorId,
      action: 'intelligence.extract_enqueue',
      entityType: 'Product',
      entityId: productId,
      after: { sourceDocumentIds: input.sourceDocumentIds, job },
    });

    return {
      productId,
      queued: true,
      queue: EXTRACT_QUEUE,
      job,
      autoCommitted: false,
    };
  }

  async runExtraction(payload: {
    organizationId: string;
    actorId: string;
    productId: string;
    familyId: string;
    sourceDocumentIds: string[];
  }) {
    const { organizationId, actorId, productId, familyId, sourceDocumentIds } = payload;

    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) {
      this.logger.warn(`Extraction skipped — product ${productId} missing`);
      return;
    }

    const family = await this.prisma.family.findFirst({
      where: { id: familyId, organizationId },
      include: { attributes: { include: { attribute: true } } },
    });
    if (!family) return;

    const sources = await this.prisma.sourceDocument.findMany({
      where: { organizationId, id: { in: sourceDocumentIds } },
    });

    const attributes = family.attributes.map((fa) => ({
      code: fa.attribute.code,
      type: fa.attribute.type,
      label: fa.attribute.label,
    }));

    const existingSuggestions = await this.prisma.aiSuggestion.findMany({
      where: { organizationId, productId },
      select: { attributeCode: true, status: true, confidenceScore: true },
    });

    const codes = attributesForExtraction(
      attributes,
      (product.values as Record<string, unknown>) || {},
      existingSuggestions,
    );

    // Drop prior low-confidence / conflict pending rows for codes we will re-propose
    if (codes.length) {
      await this.prisma.aiSuggestion.deleteMany({
        where: {
          organizationId,
          productId,
          status: 'pending',
          attributeCode: { in: codes },
          OR: [
            { confidenceScore: null },
            { confidenceScore: { lt: 0.55 } },
            { source: 'source_extraction' },
          ],
        },
      });
    }

    const primarySourceId = sources[0]?.id;
    const bundles = extractWithConflicts(
      codes,
      attributes,
      sources.map((s) => ({ id: s.id, rawContent: s.rawContent })),
    );

    const created = [];
    for (const bundle of bundles) {
      for (const p of bundle.candidates) {
        const explanation = {
          reason: p.reason,
          excerpt: p.excerpt || null,
          notFound: p.notFound,
          sourceDocumentIds: sourceDocumentIds,
          conflict: bundle.isConflict,
          conflictGroupId: bundle.isConflict ? bundle.conflictGroupId : null,
          requiresHumanChoice: bundle.isConflict,
        };

        const suggestedValue =
          p.notFound || !p.suggestedValue
            ? ({ not_found_in_source: true } as Prisma.InputJsonValue)
            : (p.suggestedValue as Prisma.InputJsonValue);

        const row = await this.prisma.aiSuggestion.create({
          data: {
            organizationId,
            productId,
            attributeCode: p.attributeCode,
            suggestedValue,
            confidence: bundle.isConflict ? 'conflict' : p.confidence,
            confidenceScore: p.confidenceScore,
            status: 'pending',
            source: bundle.isConflict ? 'source_conflict' : 'source_extraction',
            sourceDocumentId: p.sourceDocumentId || primarySourceId,
            explanation: explanation as Prisma.InputJsonValue,
          },
        });
        created.push(row);
      }
    }

    await this.billing.consumeAiCredits(organizationId, 1);
    await this.prisma.aiUsageLog.create({
      data: {
        organizationId,
        operation: this.useMock() ? 'extract.source.mock' : 'extract.source',
        tokensIn: 0,
        tokensOut: 0,
      },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'intelligence.extract_complete',
      entityType: 'Product',
      entityId: productId,
      after: { suggestionCount: created.length, attributeCodes: codes },
    });

    this.logger.log(
      `Extraction complete for product ${productId}: ${created.length} suggestions`,
    );
    return { suggestions: created };
  }

  private async assertProduct(organizationId: string, productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }
}
