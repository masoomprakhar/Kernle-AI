import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QueueService } from '../queues/queue.service';
import { pushGenericWebhook } from './connectors/generic-webhook.connector';
import { pushShopifyProduct } from './connectors/shopify.connector';
import { pushAmazonProduct } from './connectors/amazon.connector';
import { pushWalmartProduct } from './connectors/walmart.connector';
import { pushBigcommerceProduct } from './connectors/bigcommerce.connector';
import { pushGoogleProduct } from './connectors/google.connector';
import { pushPrintCatalog } from './connectors/print.connector';

const SYNC_QUEUE = 'syndication.sync';

@Injectable()
export class SyndicationService implements OnModuleInit {
  private readonly logger = new Logger(SyndicationService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(QueueService) private queues: QueueService,
  ) {}

  onModuleInit() {
    this.queues.registerHandler(SYNC_QUEUE, async (data) => {
      const { organizationId, channelId, productId } = data as {
        organizationId: string;
        channelId: string;
        productId: string;
      };
      await this.syncProduct(organizationId, channelId, productId);
    });
  }

  async readiness(organizationId: string, channelId: string, productId?: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId },
      include: { syndicationRules: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const rule = channel.syndicationRules[0] || {
      requireEnabled: true,
      minCompleteness: 95,
      filter: {},
    };

    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        ...(productId ? { id: productId } : {}),
      },
      take: productId ? 1 : 500,
    });

    const locale = channel.locales[0] || '*';
    const results = products.map((p) => {
      const reasons: string[] = [];
      if (rule.requireEnabled && !p.enabled) reasons.push('Product disabled');
      const completeness = (p.completeness as Record<string, number>) || {};
      const key = `${channel.code}|${locale}`;
      const score =
        completeness[key] ??
        completeness[`${channel.code}|*`] ??
        Object.values(completeness)[0] ??
        0;
      if (score < (rule.minCompleteness ?? 95)) {
        reasons.push(`Completeness ${score}% < ${rule.minCompleteness}%`);
      }
      if (channel.paused) reasons.push('Channel paused');
      if (!channel.connectorType && channel.code !== 'webhook') {
        /* ok for generic */
      }
      return {
        productId: p.id,
        sku: p.sku,
        ready: reasons.length === 0,
        completeness: score,
        reasons,
      };
    });

    return {
      channel: { id: channel.id, code: channel.code, connectorType: channel.connectorType },
      rule,
      readyCount: results.filter((r) => r.ready).length,
      notReadyCount: results.filter((r) => !r.ready).length,
      results,
    };
  }

  async dashboard(organizationId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { organizationId },
      include: {
        productSyncs: true,
        syndicationLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    return channels.map((ch) => {
      const syncs = ch.productSyncs;
      return {
        channelId: ch.id,
        code: ch.code,
        label: ch.label,
        connectorType: ch.connectorType,
        paused: ch.paused,
        activationStatus: ch.activationStatus,
        counts: {
          in_sync: syncs.filter((s) => s.status === 'in_sync').length,
          pending: syncs.filter((s) => s.status === 'pending').length,
          error: syncs.filter((s) => s.status === 'error').length,
        },
        recentLogs: ch.syndicationLogs,
      };
    });
  }

  async enqueueSync(
    organizationId: string,
    actorId: string,
    channelId: string,
    productIds?: string[],
  ) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    let ids: string[] = productIds?.length ? productIds : [];
    if (!ids.length) {
      const products = await this.prisma.product.findMany({
        where: { organizationId, enabled: true },
        select: { id: true },
        take: 200,
      });
      ids = products.map((p: { id: string }) => p.id);
    }

    const enqueued: string[] = [];
    for (const productId of ids) {
      await this.prisma.productChannelSync.upsert({
        where: { productId_channelId: { productId, channelId } },
        create: { productId, channelId, status: 'pending' },
        update: { status: 'pending', lastError: null },
      });
      await this.queues.enqueue(SYNC_QUEUE, { organizationId, channelId, productId });
      enqueued.push(productId);
    }

    await this.audit.log({
      organizationId,
      actorId,
      action: 'syndication.enqueue',
      entityType: 'Channel',
      entityId: channelId,
      after: { count: enqueued.length },
    });

    return { enqueued: enqueued.length, productIds: enqueued };
  }

  async forceResync(organizationId: string, actorId: string, channelId: string) {
    return this.enqueueSync(organizationId, actorId, channelId);
  }

  async syncProduct(organizationId: string, channelId: string, productId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId },
    });
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
    });
    if (!channel || !product) {
      this.logger.warn(`Sync skipped missing channel/product ${channelId}/${productId}`);
      return;
    }

    const readiness = await this.readiness(organizationId, channelId, productId);
    const item = readiness.results[0];
    if (item && !item.ready) {
      await this.prisma.productChannelSync.upsert({
        where: { productId_channelId: { productId, channelId } },
        create: {
          productId,
          channelId,
          status: 'error',
          lastError: item.reasons.join('; '),
        },
        update: { status: 'error', lastError: item.reasons.join('; ') },
      });
      await this.prisma.syndicationLog.create({
        data: {
          organizationId,
          channelId,
          productSku: product.sku,
          action: 'update',
          status: 'failed',
          responsePayload: { reasons: item.reasons } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    const sync = await this.prisma.productChannelSync.findUnique({
      where: { productId_channelId: { productId, channelId } },
    });

    let result;
    const values = (product.values as Record<string, any>) || {};
    const connector = channel.connectorType;

    if (connector === 'shopify') {
      result = await pushShopifyProduct(channel.credentialsEnc, {
        sku: product.sku,
        values,
        enabled: product.enabled,
      }, sync?.externalId);
    } else if (connector === 'amazon') {
      result = await pushAmazonProduct(channel.credentialsEnc, { sku: product.sku });
    } else if (connector === 'walmart') {
      result = await pushWalmartProduct(channel.credentialsEnc, { sku: product.sku });
    } else if (connector === 'bigcommerce') {
      result = await pushBigcommerceProduct(channel.credentialsEnc, { sku: product.sku });
    } else if (connector === 'print') {
      result = await pushPrintCatalog([{ sku: product.sku, values }]);
    } else if (connector === 'generic_api' || !connector) {
      const mapping = (channel.fieldMapping as any) || {};
      const url = mapping.webhookUrl || mapping.url;
      if (!url) {
        result = { success: false, error: 'No webhookUrl in channel.fieldMapping' };
      } else {
        result = await pushGenericWebhook(url, {
          sku: product.sku,
          values,
          enabled: product.enabled,
          channel: channel.code,
        });
      }
    } else {
      // google and unknown
      result = await pushGoogleProduct(channel.credentialsEnc, { sku: product.sku });
    }

    await this.prisma.syndicationLog.create({
      data: {
        organizationId,
        channelId,
        productSku: product.sku,
        action: sync?.externalId ? 'update' : 'create',
        status: result.success ? 'success' : 'failed',
        responsePayload: (result.responsePayload || { error: result.error }) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.productChannelSync.upsert({
      where: { productId_channelId: { productId, channelId } },
      create: {
        productId,
        channelId,
        status: result.success ? 'in_sync' : 'error',
        lastSyncAt: result.success ? new Date() : undefined,
        lastError: result.success ? null : result.error,
        externalId: result.externalId,
      },
      update: {
        status: result.success ? 'in_sync' : 'error',
        lastSyncAt: result.success ? new Date() : undefined,
        lastError: result.success ? null : result.error,
        externalId: result.externalId ?? undefined,
      },
    });
  }

  async upsertRule(
    organizationId: string,
    channelId: string,
    data: { requireEnabled?: boolean; minCompleteness?: number; filter?: object },
  ) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    const existing = await this.prisma.syndicationRule.findFirst({ where: { channelId } });
    if (existing) {
      return this.prisma.syndicationRule.update({
        where: { id: existing.id },
        data: {
          requireEnabled: data.requireEnabled,
          minCompleteness: data.minCompleteness,
          filter: data.filter as Prisma.InputJsonValue | undefined,
        },
      });
    }
    return this.prisma.syndicationRule.create({
      data: {
        channelId,
        requireEnabled: data.requireEnabled ?? true,
        minCompleteness: data.minCompleteness ?? 95,
        filter: (data.filter || {}) as Prisma.InputJsonValue,
      },
    });
  }

  listLogs(organizationId: string, channelId?: string) {
    return this.prisma.syndicationLog.findMany({
      where: { organizationId, ...(channelId ? { channelId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
