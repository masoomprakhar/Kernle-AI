import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertSuper(user: AuthUser) {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException('Super admin only');
    }
  }

  async listOrgs(user: AuthUser) {
    this.assertSuper(user);
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            memberships: true,
            products: true,
            channels: true,
          },
        },
      },
    });
    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      onboardingDone: o.onboardingDone,
      featureFlags: o.featureFlags,
      createdAt: o.createdAt,
      members: o._count.memberships,
      products: o._count.products,
      channels: o._count.channels,
      aiCreditsUsed: o.aiCreditsUsed,
      aiCreditsLimit: o.aiCreditsLimit,
    }));
  }

  /**
   * Impersonation note — does not mint a real token here.
   * Document the intended flow for ops.
   */
  async impersonateNote(user: AuthUser, organizationId: string, targetUserId?: string) {
    this.assertSuper(user);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    let target = null;
    if (targetUserId) {
      target = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, name: true },
      });
    } else {
      const membership = await this.prisma.membership.findFirst({
        where: { organizationId },
        include: { user: { select: { id: true, email: true, name: true } }, role: true },
        orderBy: { createdAt: 'asc' },
      });
      target = membership?.user || null;
    }

    await this.audit.log({
      organizationId,
      actorId: user.id,
      action: 'admin.impersonate_requested',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: { targetUserId: target?.id, note: 'token_not_issued' },
    });

    return {
      issued: false,
      note:
        'Impersonation tokens are not minted by this endpoint yet. In production, mint a short-lived JWT with claims { sub: targetUserId, organizationId, role, impersonatedBy: superAdminId, isImpersonation: true } and expire in ≤15 minutes. Audit every impersonation start/end.',
      organization: { id: org.id, name: org.name, slug: org.slug },
      suggestedTarget: target,
      suggestedClaims: target
        ? {
            sub: target.id,
            email: target.email,
            organizationId: org.id,
            impersonatedBy: user.id,
            isImpersonation: true,
            ttlMinutes: 15,
          }
        : null,
    };
  }

  async updateFeatureFlags(
    user: AuthUser,
    organizationId: string,
    featureFlags: Record<string, unknown>,
  ) {
    this.assertSuper(user);
    const before = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!before) throw new NotFoundException('Organization not found');

    const merged = {
      ...((before.featureFlags as Record<string, unknown>) || {}),
      ...featureFlags,
    };

    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { featureFlags: merged as Prisma.InputJsonValue },
    });

    await this.audit.log({
      organizationId,
      actorId: user.id,
      action: 'admin.feature_flags_update',
      entityType: 'Organization',
      entityId: organizationId,
      before: before.featureFlags,
      after: org.featureFlags,
    });

    return { id: org.id, featureFlags: org.featureFlags };
  }
}
