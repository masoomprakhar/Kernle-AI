import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { CompletenessService } from '../pim/completeness.service';
import { newCorrelationId, QueueService } from '../queues/queue.service';
import {
  applyValueMapping,
  differingFields,
  findNearDuplicates,
  findUnitInconsistencies,
  findVariantInconsistencies,
  flattenValue,
  proposeCanonicalOptions,
  type FlatProduct,
} from '../intelligence/consistency';
import {
  buildExplanation,
  groupByExplanationType,
  summarizeGroups,
  type SuggestionExplanation,
} from '../intelligence/explanation';
import { runSelfCheck } from '../intelligence/self-check';
import { FILL_QUEUE, QUALITY_QUEUE } from '../intelligence/queues';

type ToolName = 'searchProducts' | 'getIncompleteProducts' | 'countByFamily';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(forwardRef(() => BillingService)) private billing: BillingService,
    private completeness: CompletenessService,
    @Inject(QueueService) private queues: QueueService,
  ) {}

  onModuleInit() {
    this.queues.registerHandler(QUALITY_QUEUE, async (data) => {
      const { organizationId, actorId, familyId } = data as {
        organizationId: string;
        actorId?: string;
        familyId?: string;
      };
      await this.runQualityScan(organizationId, actorId, familyId);
    });
    this.queues.registerHandler(FILL_QUEUE, async (data) => {
      const { organizationId, actorId, productId } = data as {
        organizationId: string;
        actorId: string;
        productId: string;
      };
      await this.suggestFill(organizationId, actorId, productId);
    });
  }

  private useMock() {
    return process.env.AI_MOCK === 'true' || !process.env.ANTHROPIC_API_KEY;
  }

  private async logUsage(
    organizationId: string,
    operation: string,
    tokensIn = 0,
    tokensOut = 0,
  ) {
    await this.prisma.aiUsageLog.create({
      data: { organizationId, operation, tokensIn, tokensOut },
    });
    await this.billing.consumeAiCredits(organizationId, 1);
  }

  // ─── Constrained tools (NO raw SQL) ───────────────────────

  private async toolSearchProducts(organizationId: string, query: string, take = 10) {
    return this.prisma.product.findMany({
      where: {
        organizationId,
        OR: [
          { sku: { contains: query, mode: 'insensitive' } },
          { searchText: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, sku: true, enabled: true, geoScore: true, completeness: true, familyId: true },
      take: Math.min(25, take),
    });
  }

  private async toolGetIncompleteProducts(
    organizationId: string,
    channel: string,
    locale: string,
    threshold = 100,
    take = 20,
  ) {
    const products = await this.prisma.product.findMany({
      where: { organizationId, enabled: true },
      select: { id: true, sku: true, completeness: true, familyId: true },
      take: 500,
    });
    const key = `${channel}|${locale}`;
    return products
      .filter((p) => {
        const c = (p.completeness as Record<string, number>) || {};
        return (c[key] ?? 0) < threshold;
      })
      .slice(0, take);
  }

  private async toolCountByFamily(organizationId: string) {
    const families = await this.prisma.family.findMany({
      where: { organizationId },
      include: { _count: { select: { products: true } } },
    });
    return families.map((f) => ({
      familyId: f.id,
      code: f.code,
      label: f.label,
      productCount: f._count.products,
    }));
  }

  async executeTool(organizationId: string, name: ToolName, args: Record<string, any>) {
    switch (name) {
      case 'searchProducts':
        return this.toolSearchProducts(organizationId, String(args.query || ''), Number(args.take || 10));
      case 'getIncompleteProducts':
        return this.toolGetIncompleteProducts(
          organizationId,
          String(args.channel || 'ecommerce'),
          String(args.locale || 'en_US'),
          Number(args.threshold || 100),
          Number(args.take || 20),
        );
      case 'countByFamily':
        return this.toolCountByFamily(organizationId);
      default:
        throw new BadRequestException(`Tool not allowed: ${name}`);
    }
  }

  /**
   * Ask Kernle — chat with constrained tools only.
   */
  async ask(
    organizationId: string,
    userId: string,
    message: string,
    conversationId?: string,
  ) {
    await this.billing.assertAiCredits(organizationId);

    let conversation = conversationId
      ? await this.prisma.aiConversation.findFirst({
          where: { id: conversationId, organizationId },
        })
      : null;
    if (!conversation) {
      conversation = await this.prisma.aiConversation.create({
        data: { organizationId, userId, messages: [] },
      });
    }

    const history = (conversation.messages as Array<{ role: string; content: string }>) || [];
    history.push({ role: 'user', content: message });

    let assistantText: string;
    let toolResults: Array<{ tool: string; result: unknown }> = [];

    if (this.useMock()) {
      // Heuristic tool routing in mock mode
      const lower = message.toLowerCase();
      const completenessAsk =
        lower.includes('incomplete') ||
        lower.includes('completeness') ||
        (lower.includes('complete') && (lower.includes('%') || lower.includes('under') || lower.includes('below')));
      const thresholdMatch = lower.match(/(?:under|below|less than)\s*(\d+)/);
      const threshold = thresholdMatch ? Number(thresholdMatch[1]) : 70;
      if (completenessAsk) {
        const result = await this.executeTool(organizationId, 'getIncompleteProducts', {
          channel: 'ecommerce',
          locale: 'en_US',
          threshold,
        });
        toolResults.push({ tool: 'getIncompleteProducts', result });
        assistantText = `Found ${(result as any[]).length} products under ${threshold}% complete (via getIncompleteProducts tool). Nothing is auto-committed.`;
      } else if (lower.includes('family') || lower.includes('count')) {
        const result = await this.executeTool(organizationId, 'countByFamily', {});
        toolResults.push({ tool: 'countByFamily', result });
        assistantText = `Family counts: ${(result as any[]).map((r) => `${r.code}: ${r.productCount}`).join(', ') || 'none'}`;
      } else {
        const q = message.replace(/search|find|products?/gi, '').trim() || message;
        const result = await this.executeTool(organizationId, 'searchProducts', { query: q });
        toolResults.push({ tool: 'searchProducts', result });
        assistantText = `Search returned ${(result as any[]).length} products (mock mode). Tools available: searchProducts, getIncompleteProducts, countByFamily.`;
      }
      await this.logUsage(organizationId, 'ask.kernle.mock', 0, 0);
    } else {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const tools = [
          {
            name: 'searchProducts',
            description: 'Search products by SKU or text',
            input_schema: {
              type: 'object',
              properties: { query: { type: 'string' }, take: { type: 'number' } },
              required: ['query'],
            },
          },
          {
            name: 'getIncompleteProducts',
            description: 'List products below completeness threshold for channel/locale',
            input_schema: {
              type: 'object',
              properties: {
                channel: { type: 'string' },
                locale: { type: 'string' },
                threshold: { type: 'number' },
                take: { type: 'number' },
              },
              required: ['channel', 'locale'],
            },
          },
          {
            name: 'countByFamily',
            description: 'Count products grouped by family',
            input_schema: { type: 'object', properties: {} },
          },
        ];

        const resp = await client.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
          max_tokens: 1024,
          system:
            'You are Ask Kernle, a PIM assistant. Only use the provided tools. Never invent SQL. Never auto-commit catalog changes.',
          tools: tools as any,
          messages: history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        });

        // Handle one round of tool use
        const toolUses = resp.content.filter((b: any) => b.type === 'tool_use');
        if (toolUses.length) {
          const toolResultContent: any[] = [];
          for (const tu of toolUses as any[]) {
            const name = tu.name as ToolName;
            if (!['searchProducts', 'getIncompleteProducts', 'countByFamily'].includes(name)) {
              throw new ForbiddenException(`Disallowed tool: ${name}`);
            }
            const result = await this.executeTool(organizationId, name, tu.input || {});
            toolResults.push({ tool: name, result });
            toolResultContent.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify(result).slice(0, 8000),
            });
          }
          const follow = await client.messages.create({
            model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
            max_tokens: 1024,
            system:
              'You are Ask Kernle. Summarize tool results. Never auto-commit product data.',
            messages: [
              ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
              { role: 'assistant', content: resp.content as any },
              { role: 'user', content: toolResultContent },
            ],
          });
          assistantText = follow.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('\n');
          await this.logUsage(
            organizationId,
            'ask.kernle',
            (resp.usage?.input_tokens || 0) + (follow.usage?.input_tokens || 0),
            (resp.usage?.output_tokens || 0) + (follow.usage?.output_tokens || 0),
          );
        } else {
          assistantText = resp.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('\n');
          await this.logUsage(
            organizationId,
            'ask.kernle',
            resp.usage?.input_tokens || 0,
            resp.usage?.output_tokens || 0,
          );
        }
      } catch (err) {
        this.logger.error(`Ask Kernle failed: ${(err as Error).message}`);
        assistantText = `I hit an error talking to the model. Try AI_MOCK=true for local use. ${(err as Error).message}`;
      }
    }

    history.push({ role: 'assistant', content: assistantText });
    await this.prisma.aiConversation.update({
      where: { id: conversation.id },
      data: { messages: history as Prisma.InputJsonValue },
    });

    return {
      conversationId: conversation.id,
      reply: assistantText,
      toolResults,
      autoCommitted: false,
    };
  }

  // ─── Fill attribute suggestions ───────────────────────────

  private async inferFromFamily(
    organizationId: string,
    familyId: string | null | undefined,
    attributeCode: string,
    excludeProductId: string,
  ): Promise<{ value: string; sampleSku: string } | null> {
    if (!familyId) return null;
    const peers = await this.prisma.product.findMany({
      where: { organizationId, familyId, id: { not: excludeProductId }, enabled: true },
      take: 40,
      select: { id: true, sku: true, values: true },
    });
    const counts = new Map<string, { n: number; sku: string }>();
    for (const p of peers) {
      const flat = flattenValue((p.values as Record<string, unknown>)?.[attributeCode]);
      if (!flat) continue;
      const key = flat.trim();
      const cur = counts.get(key) || { n: 0, sku: p.sku };
      cur.n += 1;
      counts.set(key, cur);
    }
    let best: { value: string; n: number; sku: string } | null = null;
    for (const [value, meta] of counts) {
      if (!best || meta.n > best.n) best = { value, n: meta.n, sku: meta.sku };
    }
    if (!best || best.n < 2) return null;
    return { value: best.value, sampleSku: best.sku };
  }

  async suggestFill(organizationId: string, actorId: string, productId: string, attributeCodes?: string[]) {
    await this.billing.assertAiCredits(organizationId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: { family: { include: { attributes: { include: { attribute: true } } } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const familyAttrs = product.family?.attributes.map((a) => a.attribute) || [];
    const codes =
      attributeCodes ||
      familyAttrs.map((a) => a.code);
    const values = (product.values as Record<string, any>) || {};
    const missing = codes.filter((c) => !this.completeness.isFilled(this.completeness.getValue(values, c)));
    const attrByCode = new Map(familyAttrs.map((a) => [a.code, a]));

    const suggestions = [];
    for (const code of missing.slice(0, 10)) {
      const attr = attrByCode.get(code);
      const inferred = await this.inferFromFamily(
        organizationId,
        product.familyId,
        code,
        productId,
      );

      let suggestedValue: Prisma.InputJsonValue;
      let explanationType: 'inferred_family' | 'fill_stub';
      let reason: string;
      let originLabel: string;
      let confidenceScore = 0.65;
      let confidence = 'medium';

      if (inferred) {
        suggestedValue = {
          '<all_channels>': { '<all_locales>': inferred.value },
        } as Prisma.InputJsonValue;
        explanationType = 'inferred_family';
        reason = `Inferred from similar products in this Family (e.g. ${inferred.sampleSku}): "${inferred.value}"`;
        originLabel = 'similar products in this Family';
        confidenceScore = 0.72;
        confidence = 'medium';
      } else {
        const draft = this.useMock()
          ? `Suggested ${code} for ${product.sku}`
          : `AI draft for ${code}`;
        suggestedValue = {
          '<all_channels>': { '<all_locales>': draft },
        } as Prisma.InputJsonValue;
        explanationType = 'fill_stub';
        reason = 'Draft fill from product context — no matching family peers found';
        originLabel = 'attribute fill draft';
        confidenceScore = 0.55;
        confidence = 'low';
      }

      const selfCheckFailures = attr
        ? runSelfCheck({
            attribute: {
              code: attr.code,
              type: attr.type,
              validationRules: attr.validationRules,
              options: attr.options,
            },
            suggestedValue,
            existingValue: values[code],
          })
        : [];

      const explanation = buildExplanation({
        explanationType,
        reason,
        excerpt: inferred?.value || null,
        originLabel,
        selfCheckFailures,
        needsAttention: selfCheckFailures.length > 0,
      });

      const row = await this.prisma.aiSuggestion.create({
        data: {
          organizationId,
          productId,
          attributeCode: code,
          suggestedValue,
          confidence,
          confidenceScore,
          status: 'pending',
          source: explanationType === 'inferred_family' ? 'inferred_family' : this.useMock() ? 'mock' : 'anthropic',
          explanation: explanation as Prisma.InputJsonValue,
        },
      });
      suggestions.push(row);
    }

    await this.logUsage(organizationId, 'fill.suggest');
    await this.audit.log({
      organizationId,
      actorId,
      action: 'ai.fill_suggest',
      entityType: 'Product',
      entityId: productId,
      after: { count: suggestions.length },
    });

    return { suggestions, autoSaved: false };
  }

  /**
   * Batch enrichment across a family (or optional category filter).
   * Enqueues per-product fill jobs at batch priority (won't starve interactive work).
   * For small limits, awaits completion so the UI can triage immediately.
   */
  async suggestFillBatch(
    organizationId: string,
    actorId: string,
    input: { familyId: string; categoryId?: string; limit?: number; async?: boolean },
  ) {
    await this.billing.assertAiCredits(organizationId);
    const take = Math.min(500, Math.max(1, input.limit || 20));
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        familyId: input.familyId,
        ...(input.categoryId
          ? { categories: { some: { categoryId: input.categoryId } } }
          : {}),
      },
      take,
      select: { id: true, sku: true },
    });

    const batchCorrelationId = newCorrelationId();
    const jobs = [];
    for (const p of products) {
      const correlationId = newCorrelationId();
      const job = await this.queues.enqueue(
        FILL_QUEUE,
        {
          organizationId,
          actorId,
          productId: p.id,
          correlationId,
          batchCorrelationId,
          jobType: 'fill.batch',
        },
        {
          // Small batches await; large async batches return immediately.
          awaitInline: !input.async && products.length <= 25,
          priority: QueueService.priorities.batch,
          organizationId,
          correlationId,
          jobType: 'fill.batch',
        },
      );
      jobs.push({ productId: p.id, ...job });
    }

    // When awaited, gather pending suggestions for triage grouping
    if (!input.async && products.length <= 25) {
      const pending = await this.prisma.aiSuggestion.findMany({
        where: {
          organizationId,
          status: 'pending',
          productId: { in: products.map((p) => p.id) },
          source: { in: ['inferred_family', 'mock', 'anthropic'] },
        },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });
      const groups = groupByExplanationType(pending);
      return {
        productCount: products.length,
        suggestionCount: pending.length,
        jobsEnqueued: jobs.length,
        batchCorrelationId,
        groups: summarizeGroups(groups),
        byType: groups,
        autoSaved: false,
        mode: 'awaited' as const,
      };
    }

    return {
      productCount: products.length,
      suggestionCount: null,
      jobsEnqueued: jobs.length,
      batchCorrelationId,
      groups: [],
      autoSaved: false,
      mode: 'queued' as const,
    };
  }

  async acceptSuggestion(
    organizationId: string,
    actorId: string,
    suggestionId: string,
    editedValue?: unknown,
  ) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, organizationId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    if (suggestion.status !== 'pending') throw new BadRequestException('Already resolved');
    if (!suggestion.productId || !suggestion.attributeCode) {
      throw new BadRequestException('Suggestion missing product/attribute');
    }

    const suggested = suggestion.suggestedValue as Record<string, unknown> | null;
    if (
      suggested &&
      typeof suggested === 'object' &&
      (suggested as { not_found_in_source?: boolean }).not_found_in_source === true
    ) {
      throw new BadRequestException('Cannot accept a not-found suggestion — reject it or provide a value manually');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: suggestion.productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const valueToWrite =
      editedValue !== undefined && editedValue !== null
        ? editedValue
        : suggestion.suggestedValue;

    const asIs =
      editedValue === undefined ||
      editedValue === null ||
      JSON.stringify(editedValue) === JSON.stringify(suggestion.suggestedValue);

    const values = { ...((product.values as Record<string, any>) || {}) };
    values[suggestion.attributeCode] = valueToWrite;
    await this.prisma.product.update({
      where: { id: product.id },
      data: { values: values as Prisma.InputJsonValue, updatedById: actorId },
    });
    await this.completeness.refreshProduct(product.id);

    const prevExp = (suggestion.explanation || {}) as SuggestionExplanation;
    const explanation = buildExplanation({
      ...prevExp,
      explanationType: prevExp.explanationType || 'fill_stub',
      reason: prevExp.reason || 'Accepted',
      resolution: {
        outcome: asIs ? 'accepted_as_is' : 'edited_accept',
        editedValue: asIs ? undefined : editedValue,
        resolvedAt: new Date().toISOString(),
      },
    });

    const updated = await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'accepted',
        resolvedAt: new Date(),
        explanation: explanation as Prisma.InputJsonValue,
      },
    });

    // Conflict groups: accepting one candidate rejects the siblings (human chose).
    if (prevExp?.conflictGroupId) {
      const siblings = await this.prisma.aiSuggestion.findMany({
        where: {
          organizationId,
          productId: suggestion.productId,
          status: 'pending',
          id: { not: suggestionId },
        },
      });
      for (const sib of siblings) {
        const sibExp = sib.explanation as SuggestionExplanation | null;
        if (sibExp?.conflictGroupId === prevExp.conflictGroupId) {
          const rejectedExp = buildExplanation({
            ...sibExp,
            explanationType: sibExp.explanationType || 'source_conflict',
            reason: sibExp.reason || 'Rejected as conflict sibling',
            resolution: {
              outcome: 'rejected',
              resolvedAt: new Date().toISOString(),
            },
          });
          await this.prisma.aiSuggestion.update({
            where: { id: sib.id },
            data: {
              status: 'rejected',
              resolvedAt: new Date(),
              explanation: rejectedExp as Prisma.InputJsonValue,
            },
          });
        }
      }
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: 'ai.suggestion_accept',
      entityType: 'AiSuggestion',
      entityId: suggestionId,
      after: {
        productId: product.id,
        attributeCode: suggestion.attributeCode,
        conflictGroupId: prevExp?.conflictGroupId || null,
        outcome: asIs ? 'accepted_as_is' : 'edited_accept',
      },
    });
    return updated;
  }

  async rejectSuggestion(organizationId: string, actorId: string, suggestionId: string) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, organizationId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    const prevExp = (suggestion.explanation || {}) as SuggestionExplanation;
    const explanation = buildExplanation({
      ...prevExp,
      explanationType: prevExp.explanationType || 'fill_stub',
      reason: prevExp.reason || 'Rejected',
      resolution: {
        outcome: 'rejected',
        resolvedAt: new Date().toISOString(),
      },
    });
    const updated = await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'rejected',
        resolvedAt: new Date(),
        explanation: explanation as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'ai.suggestion_reject',
      entityType: 'AiSuggestion',
      entityId: suggestionId,
    });
    return updated;
  }

  listSuggestions(organizationId: string, status = 'pending', productId?: string) {
    return this.prisma.aiSuggestion.findMany({
      where: {
        organizationId,
        status,
        ...(productId ? { productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        product: { select: { id: true, sku: true } },
        sourceDocument: {
          select: { id: true, type: true, filename: true, status: true },
        },
      },
    });
  }

  async listSuggestionsGrouped(organizationId: string, status = 'pending') {
    const rows = await this.listSuggestions(organizationId, status);
    const groups = groupByExplanationType(rows);
    return {
      total: rows.length,
      groups: summarizeGroups(groups),
      byType: groups,
    };
  }

  /**
   * Read-only calibration: accept/reject/edit rates by attribute code (and type when known).
   */
  /**
   * Catalog-wide Product Intelligence health for the dashboard (Phase 5).
   * Read-only aggregation over existing SourceDocument / suggestion / finding data.
   */
  async intelligenceOverview(organizationId: string, periodDays = 30) {
    const days = Math.min(Math.max(Number(periodDays) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      sourcesInPeriod,
      productsTouched,
      pendingSuggestions,
      openFindings,
      resolvedFindings,
      acceptedFromSource,
      accuracy,
      grouped,
    ] = await Promise.all([
      this.prisma.sourceDocument.count({
        where: { organizationId, createdAt: { gte: since } },
      }),
      this.prisma.sourceDocument.findMany({
        where: {
          organizationId,
          productId: { not: null },
          createdAt: { gte: since },
        },
        select: { productId: true },
        distinct: ['productId'],
      }),
      this.prisma.aiSuggestion.count({
        where: { organizationId, status: 'pending' },
      }),
      this.prisma.qualityFinding.count({
        where: { organizationId, resolved: false },
      }),
      this.prisma.qualityFinding.count({
        where: { organizationId, resolved: true, createdAt: { gte: since } },
      }),
      this.prisma.aiSuggestion.findMany({
        where: {
          organizationId,
          status: 'accepted',
          source: { in: ['source_extraction', 'source_conflict'] },
          resolvedAt: { gte: since },
          productId: { not: null },
        },
        select: {
          productId: true,
          resolvedAt: true,
          createdAt: true,
          sourceDocumentId: true,
        },
        take: 2000,
        orderBy: { resolvedAt: 'desc' },
      }),
      this.accuracyInsights(organizationId),
      this.listSuggestionsGrouped(organizationId, 'pending'),
    ]);

    // Average time from earliest linked source → first accept for that product in period.
    const productIds = [
      ...new Set(
        acceptedFromSource
          .map((s) => s.productId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].slice(0, 200);

    let avgSourceToAcceptMs: number | null = null;
    let sampleSize = 0;
    if (productIds.length) {
      const firstSources = await this.prisma.sourceDocument.findMany({
        where: { organizationId, productId: { in: productIds } },
        select: { productId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      const firstByProduct = new Map<string, Date>();
      for (const row of firstSources) {
        if (!row.productId || firstByProduct.has(row.productId)) continue;
        firstByProduct.set(row.productId, row.createdAt);
      }
      const firstAcceptByProduct = new Map<string, Date>();
      for (const s of acceptedFromSource) {
        if (!s.productId || !s.resolvedAt) continue;
        const prev = firstAcceptByProduct.get(s.productId);
        if (!prev || s.resolvedAt < prev) firstAcceptByProduct.set(s.productId, s.resolvedAt);
      }
      const deltas: number[] = [];
      for (const [pid, acceptedAt] of firstAcceptByProduct) {
        const sourceAt = firstByProduct.get(pid);
        if (!sourceAt) continue;
        const ms = acceptedAt.getTime() - sourceAt.getTime();
        if (ms >= 0) deltas.push(ms);
      }
      sampleSize = deltas.length;
      if (deltas.length) {
        avgSourceToAcceptMs = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
      }
    }

    return {
      periodDays: days,
      productsFromSource: productsTouched.length,
      sourcesIngested: sourcesInPeriod,
      pendingSuggestions,
      findings: {
        outstanding: openFindings,
        resolvedInPeriod: resolvedFindings,
      },
      avgSourceToAcceptMs,
      avgSourceToAcceptSampleSize: sampleSize,
      accuracy: {
        sampleSize: accuracy.sampleSize,
        byAttribute: (accuracy.byAttribute || []).slice(0, 8),
      },
      pendingByExplanation: grouped.groups || [],
      links: {
        workflow: '/products/new/from-source',
        queue: '/ai',
        bulk: '/products',
      },
    };
  }

  async accuracyInsights(organizationId: string) {
    const resolved = await this.prisma.aiSuggestion.findMany({
      where: {
        organizationId,
        status: { in: ['accepted', 'rejected'] },
      },
      take: 2000,
      orderBy: { resolvedAt: 'desc' },
    });

    const attrs = await this.prisma.attribute.findMany({
      where: { organizationId },
      select: { code: true, type: true },
    });
    const typeByCode = new Map(attrs.map((a) => [a.code, a.type]));

    type Bucket = {
      attributeCode: string;
      attributeType: string;
      total: number;
      acceptedAsIs: number;
      editedAccept: number;
      rejected: number;
    };
    const byCode = new Map<string, Bucket>();

    for (const s of resolved) {
      const code = s.attributeCode || 'unknown';
      const exp = s.explanation as SuggestionExplanation | null;
      const bucket = byCode.get(code) || {
        attributeCode: code,
        attributeType: typeByCode.get(code) || 'unknown',
        total: 0,
        acceptedAsIs: 0,
        editedAccept: 0,
        rejected: 0,
      };
      bucket.total += 1;
      const outcome = exp?.resolution?.outcome;
      if (outcome === 'edited_accept') bucket.editedAccept += 1;
      else if (outcome === 'accepted_as_is' || (s.status === 'accepted' && !outcome)) {
        bucket.acceptedAsIs += 1;
      } else if (s.status === 'rejected' || outcome === 'rejected') {
        bucket.rejected += 1;
      }
      byCode.set(code, bucket);
    }

    const rows = [...byCode.values()]
      .map((b) => ({
        ...b,
        acceptedAsIsRate: b.total ? b.acceptedAsIs / b.total : 0,
        editedAcceptRate: b.total ? b.editedAccept / b.total : 0,
        rejectedRate: b.total ? b.rejected / b.total : 0,
        summary:
          b.total === 0
            ? 'No data'
            : `${b.attributeCode} (${b.attributeType}): accepted as-is ${Math.round(
                (b.acceptedAsIs / b.total) * 100,
              )}% of the time; edited before accepting ${Math.round(
                (b.editedAccept / b.total) * 100,
              )}% of the time; rejected ${Math.round((b.rejected / b.total) * 100)}%`,
      }))
      .sort((a, b) => b.total - a.total);

    return { byAttribute: rows, sampleSize: resolved.length };
  }

  // ─── Quality scan ─────────────────────────────────────────

  async enqueueQualityScan(
    organizationId: string,
    actorId: string,
    opts?: { familyId?: string; async?: boolean },
  ) {
    const correlationId = newCorrelationId();
    const priority = opts?.familyId
      ? QueueService.priorities.interactive
      : QueueService.priorities.batch;
    const job = await this.queues.enqueue(
      QUALITY_QUEUE,
      {
        organizationId,
        actorId,
        familyId: opts?.familyId,
        correlationId,
        jobType: opts?.familyId ? 'quality.family' : 'quality.full',
      },
      {
        awaitInline: !opts?.async,
        priority,
        organizationId,
        correlationId,
        jobType: opts?.familyId ? 'quality.family' : 'quality.full',
      },
    );

    if (opts?.async) {
      return { queued: true, ran: false, queue: QUALITY_QUEUE, job, correlationId };
    }

    // When awaited, return latest open findings count for UX
    const open = await this.prisma.qualityFinding.count({
      where: { organizationId, resolved: false },
    });
    return {
      queued: true,
      ran: true,
      queue: QUALITY_QUEUE,
      job,
      correlationId,
      findingsCreated: open,
    };
  }

  async runQualityScan(organizationId: string, actorId?: string, familyId?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        ...(familyId ? { familyId } : {}),
      },
      include: { assetLinks: { include: { asset: true } }, family: true },
      take: familyId ? 2000 : 500,
    });

    const attributes = await this.prisma.attribute.findMany({
      where: { organizationId, archived: false },
    });

    const findings: Array<{
      category: string;
      severity: string;
      title: string;
      description: string;
      entityType?: string;
      entityId?: string;
      fixAction?: object;
    }> = [];

    for (const p of products) {
      const completeness = (p.completeness as Record<string, number>) || {};
      const scores = Object.values(completeness);
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;
      if (avg < 80) {
        findings.push({
          category: 'completeness',
          severity: avg < 50 ? 'high' : 'medium',
          title: `Low completeness for ${p.sku}`,
          description: `Average completeness is ${Math.round(avg)}%`,
          entityType: 'Product',
          entityId: p.id,
          fixAction: { type: 'open_product', productId: p.id },
        });
      }
      if (p.geoScore < 40) {
        findings.push({
          category: 'seo_geo',
          severity: 'medium',
          title: `Low GEO score for ${p.sku}`,
          description: `GEO score is ${p.geoScore}/100`,
          entityType: 'Product',
          entityId: p.id,
        });
      }
      if (!p.assetLinks.length) {
        findings.push({
          category: 'media',
          severity: 'low',
          title: `No assets linked to ${p.sku}`,
          description: 'Products without imagery reduce conversion and GEO quality',
          entityType: 'Product',
          entityId: p.id,
        });
      }
      if (!p.familyId) {
        findings.push({
          category: 'structure',
          severity: 'high',
          title: `Product ${p.sku} has no family`,
          description: 'Assign a family to enable completeness rules',
          entityType: 'Product',
          entityId: p.id,
        });
      }
    }

    // Phase 2: catalog-wide consistency + near-duplicates per family
    const flatProducts: FlatProduct[] = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      familyId: p.familyId,
      values: (p.values as Record<string, unknown>) || {},
    }));
    const familyMap = new Map<string, { id: string; code: string }>();
    for (const p of products) {
      if (p.familyId && p.family) {
        familyMap.set(p.familyId, { id: p.familyId, code: p.family.code });
      }
    }

    for (const family of familyMap.values()) {
      for (const attr of attributes) {
        const variant = findVariantInconsistencies(
          family.id,
          family.code,
          {
            id: attr.id,
            code: attr.code,
            type: attr.type,
            unit: attr.unit,
            options: attr.options,
          },
          flatProducts,
        );
        if (variant) findings.push(variant);

        const units = findUnitInconsistencies(
          family.id,
          family.code,
          {
            id: attr.id,
            code: attr.code,
            type: attr.type,
            unit: attr.unit,
            options: attr.options,
          },
          flatProducts,
        );
        if (units) findings.push(units);
      }

      findings.push(...findNearDuplicates(family.id, family.code, flatProducts));
    }

    // Replace prior unresolved Phase-2 categories so re-scans don't pile up.
    // When scoped to a family, only resolve findings whose fixAction.familyId matches.
    if (familyId) {
      const open = await this.prisma.qualityFinding.findMany({
        where: {
          organizationId,
          resolved: false,
          category: { in: ['consistency', 'near_duplicate'] },
        },
        take: 500,
      });
      for (const f of open) {
        const fix = f.fixAction as { familyId?: string } | null;
        if (fix?.familyId === familyId) {
          await this.prisma.qualityFinding.update({
            where: { id: f.id },
            data: { resolved: true },
          });
        }
      }
    } else {
      await this.prisma.qualityFinding.updateMany({
        where: {
          organizationId,
          resolved: false,
          category: { in: ['consistency', 'near_duplicate'] },
        },
        data: { resolved: true },
      });
    }

    const created = [];
    for (const f of findings) {
      const row = await this.prisma.qualityFinding.create({
        data: {
          organizationId,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          entityType: f.entityType,
          entityId: f.entityId,
          fixAction: (f.fixAction || null) as Prisma.InputJsonValue,
        },
      });
      created.push(row);
    }

    await this.logUsage(organizationId, 'quality.scan');
    if (actorId) {
      await this.audit.log({
        organizationId,
        actorId,
        action: 'ai.quality_scan',
        entityType: 'Organization',
        entityId: organizationId,
        after: { findings: created.length },
      });
    }
    return { findingsCreated: created.length, findings: created.slice(0, 50) };
  }

  listFindings(organizationId: string, resolved?: boolean) {
    return this.prisma.qualityFinding.findMany({
      where: {
        organizationId,
        ...(resolved === undefined ? {} : { resolved }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async resolveFinding(organizationId: string, id: string) {
    const finding = await this.prisma.qualityFinding.findFirst({
      where: { id, organizationId },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    return this.prisma.qualityFinding.update({
      where: { id },
      data: { resolved: true },
    });
  }

  /**
   * One-click merge to canonical value from a consistency finding.
   * Writes an audit entry with before/after product patches for reversibility.
   */
  async mergeFindingToCanonical(organizationId: string, actorId: string, findingId: string) {
    const finding = await this.prisma.qualityFinding.findFirst({
      where: { id: findingId, organizationId },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    const fix = finding.fixAction as {
      type?: string;
      attributeCode?: string;
      familyId?: string;
      mapping?: Record<string, string>;
      canonical?: string;
    } | null;
    if (!fix || fix.type !== 'merge_to_canonical' || !fix.attributeCode || !fix.mapping) {
      throw new BadRequestException('Finding does not support merge_to_canonical');
    }

    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        ...(fix.familyId ? { familyId: fix.familyId } : {}),
      },
    });

    const changes: Array<{ productId: string; sku: string; before: string; after: string }> = [];
    for (const p of products) {
      const values = (p.values as Record<string, unknown>) || {};
      const result = applyValueMapping(values, fix.attributeCode, fix.mapping);
      if (!result.changed) continue;
      await this.prisma.product.update({
        where: { id: p.id },
        data: { values: result.next as Prisma.InputJsonValue, updatedById: actorId },
      });
      await this.completeness.refreshProduct(p.id);
      changes.push({
        productId: p.id,
        sku: p.sku,
        before: result.before,
        after: result.after,
      });
    }

    await this.prisma.qualityFinding.update({
      where: { id: findingId },
      data: { resolved: true },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'consistency.merge_to_canonical',
      entityType: 'QualityFinding',
      entityId: findingId,
      before: { mapping: fix.mapping },
      after: { canonical: fix.canonical, changes },
      metadata: { reversible: true, attributeCode: fix.attributeCode },
    });

    return { merged: changes.length, changes, findingId };
  }

  async proposeCanonicalization(organizationId: string, actorId: string, attributeId: string) {
    await this.billing.assertAiCredits(organizationId);
    const attribute = await this.prisma.attribute.findFirst({
      where: { id: attributeId, organizationId },
    });
    if (!attribute) throw new NotFoundException('Attribute not found');
    if (!['select', 'multiselect', 'text'].includes(attribute.type)) {
      throw new BadRequestException('Canonicalization supports select, multiselect, or text attributes');
    }

    const products = await this.prisma.product.findMany({
      where: { organizationId },
      take: 1000,
    });
    const flat: FlatProduct[] = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      familyId: p.familyId,
      values: (p.values as Record<string, unknown>) || {},
    }));

    const proposal = proposeCanonicalOptions(
      {
        id: attribute.id,
        code: attribute.code,
        type: attribute.type,
        unit: attribute.unit,
        options: attribute.options,
      },
      flat,
    );

    await this.logUsage(organizationId, this.useMock() ? 'canonicalize.propose.mock' : 'canonicalize.propose');
    await this.audit.log({
      organizationId,
      actorId,
      action: 'consistency.canonicalize_propose',
      entityType: 'Attribute',
      entityId: attributeId,
      after: proposal,
    });

    return {
      attributeId: attribute.id,
      attributeCode: attribute.code,
      mapping: proposal.mapping,
      proposedOptions: proposal.proposedOptions,
      autoApplied: false,
    };
  }

  async applyCanonicalization(
    organizationId: string,
    actorId: string,
    attributeId: string,
    mappingRows: Array<{ oldValue: string; canonicalValue: string }>,
    updateAttributeOptions = true,
  ) {
    const attribute = await this.prisma.attribute.findFirst({
      where: { id: attributeId, organizationId },
    });
    if (!attribute) throw new NotFoundException('Attribute not found');
    if (!mappingRows?.length) throw new BadRequestException('mapping required');

    const mapping: Record<string, string> = {};
    for (const row of mappingRows) {
      if (row.oldValue && row.canonicalValue && row.oldValue !== row.canonicalValue) {
        mapping[row.oldValue] = row.canonicalValue;
      }
    }

    const products = await this.prisma.product.findMany({ where: { organizationId }, take: 2000 });
    const changes: Array<{ productId: string; sku: string; before: string; after: string }> = [];
    for (const p of products) {
      const values = (p.values as Record<string, unknown>) || {};
      const result = applyValueMapping(values, attribute.code, mapping);
      if (!result.changed) continue;
      await this.prisma.product.update({
        where: { id: p.id },
        data: { values: result.next as Prisma.InputJsonValue, updatedById: actorId },
      });
      await this.completeness.refreshProduct(p.id);
      changes.push({
        productId: p.id,
        sku: p.sku,
        before: result.before,
        after: result.after,
      });
    }

    let optionsBefore = attribute.options;
    if (updateAttributeOptions) {
      const proposed = [...new Set(mappingRows.map((m) => m.canonicalValue).filter(Boolean))];
      const optionObjs = proposed.map((label) => ({ code: label, label: { en_US: label } }));
      await this.prisma.attribute.update({
        where: { id: attribute.id },
        data: { options: optionObjs as Prisma.InputJsonValue },
      });
    }

    const affectedFamilyIds = [
      ...new Set(
        products
          .filter((p) => changes.some((c) => c.productId === p.id))
          .map((p) => p.familyId)
          .filter(Boolean) as string[],
      ),
    ];

    // Incremental consistency: only re-check affected families (not whole catalog).
    const familyJobs = [];
    for (const fid of affectedFamilyIds) {
      familyJobs.push(
        await this.enqueueQualityScan(organizationId, actorId, {
          familyId: fid,
          async: true,
        }),
      );
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: 'consistency.canonicalize_apply',
      entityType: 'Attribute',
      entityId: attributeId,
      before: { options: optionsBefore, mapping },
      after: { changes, mappingRows, affectedFamilyIds, familyJobs },
      metadata: { reversible: true },
    });

    return {
      updatedProducts: changes.length,
      changes,
      affectedFamilyIds,
      consistencyJobs: familyJobs,
    };
  }

  async jobMetrics() {
    const snapshot = this.queues.getMetrics();
    const depths = await this.queues.getQueueDepths();
    return {
      ...snapshot,
      depths,
      limits: {
        orgConcurrency: Number(process.env.AI_ORG_JOB_CONCURRENCY || 2),
        workerConcurrency: Number(process.env.AI_WORKER_CONCURRENCY || 4),
        interactivePriority: QueueService.priorities.interactive,
        batchPriority: QueueService.priorities.batch,
      },
    };
  }

  async compareProducts(organizationId: string, productIds: string[]) {
    if (!productIds?.length || productIds.length < 2) {
      throw new BadRequestException('At least two productIds required');
    }
    const products = await this.prisma.product.findMany({
      where: { organizationId, id: { in: productIds.slice(0, 5) } },
      include: { family: { select: { id: true, code: true, label: true } } },
    });
    if (products.length < 2) throw new NotFoundException('Products not found');

    const flat = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      familyId: p.familyId,
      values: (p.values as Record<string, unknown>) || {},
      family: p.family,
    }));

    const diffs = differingFields(
      { id: flat[0].id, sku: flat[0].sku, familyId: flat[0].familyId, values: flat[0].values },
      { id: flat[1].id, sku: flat[1].sku, familyId: flat[1].familyId, values: flat[1].values },
    );

    const allCodes = new Set<string>();
    for (const p of flat) Object.keys(p.values).forEach((c) => allCodes.add(c));

    return {
      products: flat.map((p) => ({
        id: p.id,
        sku: p.sku,
        familyId: p.familyId,
        family: p.family,
        values: Object.fromEntries(
          [...allCodes].map((code) => [code, flattenValue(p.values[code])]),
        ),
      })),
      differingFields: diffs,
    };
  }

  // ─── Market signals ───────────────────────────────────────

  listSignals(organizationId: string, sku?: string) {
    return this.prisma.marketSignal.findMany({
      where: { organizationId, ...(sku ? { sku } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createSignal(
    organizationId: string,
    actorId: string,
    data: { sku: string; signalType: string; value: number; metadata?: object },
  ) {
    const signal = await this.prisma.marketSignal.create({
      data: {
        organizationId,
        sku: data.sku,
        signalType: data.signalType,
        value: data.value,
        metadata: (data.metadata || {}) as Prisma.InputJsonValue,
      },
    });
    await this.audit.log({
      organizationId,
      actorId,
      action: 'market_signal.create',
      entityType: 'MarketSignal',
      entityId: signal.id,
      after: signal,
    });
    return signal;
  }

  /** Simple correlation: average signal value vs product geoScore for matching SKUs. */
  async correlationInsight(organizationId: string, signalType?: string) {
    const signals = await this.prisma.marketSignal.findMany({
      where: { organizationId, ...(signalType ? { signalType } : {}) },
      take: 1000,
    });
    if (!signals.length) {
      return { message: 'No market signals yet', pairs: [], correlationHint: null };
    }

    const bySku = new Map<string, number[]>();
    for (const s of signals) {
      const arr = bySku.get(s.sku) || [];
      arr.push(s.value);
      bySku.set(s.sku, arr);
    }

    const pairs: Array<{ sku: string; avgSignal: number; geoScore: number }> = [];
    for (const [sku, vals] of bySku) {
      const product = await this.prisma.product.findFirst({
        where: { organizationId, sku },
        select: { geoScore: true },
      });
      if (!product) continue;
      const avgSignal = vals.reduce((a, b) => a + b, 0) / vals.length;
      pairs.push({ sku, avgSignal, geoScore: product.geoScore });
    }

    let correlationHint: string | null = null;
    if (pairs.length >= 3) {
      const n = pairs.length;
      const meanX = pairs.reduce((a, p) => a + p.geoScore, 0) / n;
      const meanY = pairs.reduce((a, p) => a + p.avgSignal, 0) / n;
      let num = 0;
      let denX = 0;
      let denY = 0;
      for (const p of pairs) {
        const dx = p.geoScore - meanX;
        const dy = p.avgSignal - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const r = denX && denY ? num / Math.sqrt(denX * denY) : 0;
      correlationHint =
        r > 0.4
          ? `Positive correlation (r≈${r.toFixed(2)}) between GEO score and ${signalType || 'signals'}`
          : r < -0.4
            ? `Negative correlation (r≈${r.toFixed(2)}) between GEO score and ${signalType || 'signals'}`
            : `Weak correlation (r≈${r.toFixed(2)}) — more data may help`;
    }

    return { pairs, correlationHint, sampleSize: pairs.length };
  }

  listUsage(organizationId: string) {
    return this.prisma.aiUsageLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
