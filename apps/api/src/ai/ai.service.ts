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
import { QueueService } from '../queues/queue.service';

const QUALITY_QUEUE = 'ai.quality_scan';

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
      const { organizationId, actorId } = data as { organizationId: string; actorId?: string };
      await this.runQualityScan(organizationId, actorId);
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

  async suggestFill(organizationId: string, actorId: string, productId: string, attributeCodes?: string[]) {
    await this.billing.assertAiCredits(organizationId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: { family: { include: { attributes: { include: { attribute: true } } } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const codes =
      attributeCodes ||
      product.family?.attributes.map((a) => a.attribute.code) ||
      [];
    const values = (product.values as Record<string, any>) || {};
    const missing = codes.filter((c) => !this.completeness.isFilled(this.completeness.getValue(values, c)));

    const suggestions = [];
    for (const code of missing.slice(0, 10)) {
      const suggestedValue = this.useMock()
        ? { '<all_channels>': { '<all_locales>': `Suggested ${code} for ${product.sku}` } }
        : { '<all_channels>': { '<all_locales>': `AI draft for ${code}` } };

      const row = await this.prisma.aiSuggestion.create({
        data: {
          organizationId,
          productId,
          attributeCode: code,
          suggestedValue: suggestedValue as Prisma.InputJsonValue,
          confidence: 'medium',
          confidenceScore: 0.65,
          status: 'pending',
          source: this.useMock() ? 'mock' : 'anthropic',
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

  async acceptSuggestion(organizationId: string, actorId: string, suggestionId: string) {
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

    const values = { ...((product.values as Record<string, any>) || {}) };
    values[suggestion.attributeCode] = suggestion.suggestedValue;
    await this.prisma.product.update({
      where: { id: product.id },
      data: { values: values as Prisma.InputJsonValue, updatedById: actorId },
    });
    await this.completeness.refreshProduct(product.id);

    const updated = await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'accepted', resolvedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'ai.suggestion_accept',
      entityType: 'AiSuggestion',
      entityId: suggestionId,
      after: { productId: product.id, attributeCode: suggestion.attributeCode },
    });
    return updated;
  }

  async rejectSuggestion(organizationId: string, actorId: string, suggestionId: string) {
    const suggestion = await this.prisma.aiSuggestion.findFirst({
      where: { id: suggestionId, organizationId },
    });
    if (!suggestion) throw new NotFoundException('Suggestion not found');
    const updated = await this.prisma.aiSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'rejected', resolvedAt: new Date() },
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
      take: 100,
      include: {
        product: { select: { id: true, sku: true } },
        sourceDocument: {
          select: { id: true, type: true, filename: true, status: true },
        },
      },
    });
  }

  // ─── Quality scan ─────────────────────────────────────────

  async enqueueQualityScan(organizationId: string, actorId: string) {
    await this.queues.enqueue(QUALITY_QUEUE, { organizationId, actorId });
    return { queued: true, queue: QUALITY_QUEUE };
  }

  async runQualityScan(organizationId: string, actorId?: string) {
    const products = await this.prisma.product.findMany({
      where: { organizationId },
      include: { assetLinks: { include: { asset: true } }, family: true },
      take: 500,
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

    // Clear prior unresolved scan findings of same categories (optional soft approach: just add)
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
