import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PLAN_DEFAULTS: Record<
  string,
  { skuLimit: number; seatLimit: number; channelLimit: number; aiCreditsLimit: number }
> = {
  Starter: { skuLimit: 1000, seatLimit: 5, channelLimit: 2, aiCreditsLimit: 500 },
  Growth: { skuLimit: 10000, seatLimit: 25, channelLimit: 10, aiCreditsLimit: 5000 },
  Enterprise: { skuLimit: 1000000, seatLimit: 1000, channelLimit: 100, aiCreditsLimit: 100000 },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getUsage(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const [skuCount, seatCount, channelCount] = await Promise.all([
      this.prisma.product.count({ where: { organizationId } }),
      this.prisma.membership.count({ where: { organizationId } }),
      this.prisma.channel.count({ where: { organizationId } }),
    ]);
    return {
      plan: org.plan,
      meters: {
        skus: { used: skuCount, limit: org.skuLimit },
        seats: { used: seatCount, limit: org.seatLimit },
        channels: { used: channelCount, limit: org.channelLimit },
        aiCredits: { used: org.aiCreditsUsed, limit: org.aiCreditsLimit },
      },
      stripeCustomerId: org.stripeCustomerId,
      stripeSubId: org.stripeSubId,
    };
  }

  async assertSkuLimit(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const count = await this.prisma.product.count({ where: { organizationId } });
    if (count >= org.skuLimit) {
      throw new ForbiddenException(
        `SKU limit reached (${org.skuLimit}) for plan ${org.plan}. Upgrade to add more products.`,
      );
    }
  }

  async assertChannelLimit(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const count = await this.prisma.channel.count({ where: { organizationId } });
    if (count >= org.channelLimit) {
      throw new ForbiddenException(
        `Channel limit reached (${org.channelLimit}) for plan ${org.plan}.`,
      );
    }
  }

  async assertAiCredits(organizationId: string, cost = 1) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (org.aiCreditsUsed + cost > org.aiCreditsLimit) {
      throw new ForbiddenException('AI credit limit reached for current plan');
    }
  }

  async consumeAiCredits(organizationId: string, cost = 1) {
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { aiCreditsUsed: { increment: cost } },
    });
  }

  /**
   * Stripe Checkout Session stub — returns a mock session URL when Stripe is not configured.
   */
  async createCheckoutSession(
    organizationId: string,
    actorId: string,
    plan: 'Growth' | 'Enterprise',
  ) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const successUrl = process.env.BILLING_SUCCESS_URL || 'http://localhost:3001/settings/billing?ok=1';
    const cancelUrl = process.env.BILLING_CANCEL_URL || 'http://localhost:3001/settings/billing?canceled=1';

    if (!process.env.STRIPE_SECRET_KEY) {
      this.logger.warn('STRIPE_SECRET_KEY missing — returning checkout stub');
      await this.audit.log({
        organizationId,
        actorId,
        action: 'billing.checkout_stub',
        entityType: 'Organization',
        entityId: organizationId,
        after: { plan },
      });
      return {
        stub: true,
        url: `${successUrl}&stub=1&plan=${plan}`,
        sessionId: `stub_cs_${organizationId}_${plan}`,
        message: 'Stripe not configured. In production this returns a real Checkout Session URL.',
      };
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        metadata: { organizationId: org.id },
      });
      customerId = customer.id;
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId =
      plan === 'Enterprise'
        ? process.env.STRIPE_PRICE_ENTERPRISE
        : process.env.STRIPE_PRICE_GROWTH;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: `Kernle ${plan}` },
                unit_amount: plan === 'Enterprise' ? 99900 : 19900,
                recurring: { interval: 'month' },
              },
              quantity: 1,
            },
          ],
      metadata: { organizationId, plan },
    });

    await this.audit.log({
      organizationId,
      actorId,
      action: 'billing.checkout_created',
      entityType: 'Organization',
      entityId: organizationId,
      after: { sessionId: session.id, plan },
    });

    return { stub: false, url: session.url, sessionId: session.id };
  }

  /** Webhook handler stub — applies plan limits on checkout.session.completed. */
  async handleWebhook(rawBody: string | Buffer, signature?: string) {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      this.logger.warn('Stripe webhook stub invoked without keys');
      return { received: true, stub: true };
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature || '',
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      this.logger.error(`Webhook signature failed: ${(err as Error).message}`);
      return { received: false, error: 'invalid_signature' };
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const organizationId = session.metadata?.organizationId;
      const plan = session.metadata?.plan || 'Growth';
      if (organizationId) {
        const defaults = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.Growth;
        await this.prisma.organization.update({
          where: { id: organizationId },
          data: {
            plan: plan as any,
            stripeSubId: session.subscription || undefined,
            ...defaults,
          },
        });
        await this.audit.log({
          organizationId,
          action: 'billing.plan_updated',
          entityType: 'Organization',
          entityId: organizationId,
          after: { plan, ...defaults },
        });
      }
    }

    return { received: true, type: event.type };
  }
}
