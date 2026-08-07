import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { RoleName, SkuBand, UseCase } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OnboardingDto, SignupDto } from './dto';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

const SKU_MAP: Record<string, SkuBand> = {
  lt_1k: 'lt_1k',
  '1k_10k': 'one_k_10k',
  '10k_100k': 'ten_k_100k',
  '100k_plus': 'hundred_k_plus',
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
  ) {}

  private accessSecret() {
    return process.env.JWT_ACCESS_SECRET || 'change-me-access-secret-min-32-chars!!';
  }

  private refreshSecret() {
    return process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret-min-32-chars!';
  }

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
      },
    });

    const token = randomBytes(32).toString('hex');
    await this.prisma.emailToken.create({
      data: {
        userId: user.id,
        type: 'verify',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const verifyUrl = `${process.env.APP_URL || 'http://localhost:3001'}/verify-email?token=${token}`;
    console.log(`[DEV EMAIL] Verify email for ${user.email}: ${verifyUrl}`);

    return { id: user.id, email: user.email, message: 'Check console for verification link in development' };
  }

  async verifyEmail(token: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.emailToken.findUnique({ where: { tokenHash } });
    if (!record || record.type !== 'verify' || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification token');
    }
    await this.prisma.$transaction([
      this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: true, role: true },
    });

    const tokens = await this.issueTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: !!user.emailVerifiedAt,
        isSuperAdmin: user.isSuperAdmin,
      },
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role.name,
        onboardingDone: m.organization.onboardingDone,
      })),
      ...tokens,
    };
  }

  async issueTokens(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.accessSecret(), expiresIn: process.env.JWT_ACCESS_TTL || '15m' },
    );
    const refreshRaw = randomBytes(48).toString('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, jti: refreshRaw },
      { secret: this.refreshSecret(), expiresIn: process.env.JWT_REFRESH_TTL || '7d' },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshRaw),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; jti: string }>(
        refreshToken,
        { secret: this.refreshSecret() },
      );
      const stored = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(payload.jti) },
      });
      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      return this.issueTokens(payload.sub, payload.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return { ok: true };
    const token = randomBytes(32).toString('hex');
    await this.prisma.emailToken.create({
      data: {
        userId: user.id,
        type: 'reset',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password?token=${token}`;
    console.log(`[DEV EMAIL] Reset password for ${user.email}: ${resetUrl}`);
    return { ok: true };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.type !== 'reset' || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction([
      this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    ]);
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { organization: true, role: true },
    });
    const workspaces = await this.prisma.workspace.findMany({
      where: { organizationId: { in: memberships.map((m) => m.organizationId) } },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: !!user.emailVerifiedAt,
      isSuperAdmin: user.isSuperAdmin,
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        role: m.role.name,
        onboardingDone: m.organization.onboardingDone,
        plan: m.organization.plan,
      })),
      workspaces: workspaces.map((w) => ({
        id: w.id,
        organizationId: w.organizationId,
        name: w.name,
        slug: w.slug,
        isDefault: w.isDefault,
      })),
    };
  }

  async onboard(userId: string, dto: OnboardingDto) {
    let base = slugify(dto.companyName) || 'org';
    let slug = base;
    let i = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }

    const ownerRole = await this.prisma.role.findUniqueOrThrow({ where: { name: RoleName.Owner } });

    const org = await this.prisma.organization.create({
      data: {
        name: dto.companyName,
        slug,
        industry: dto.industry,
        useCase: dto.useCase as UseCase,
        skuBand: SKU_MAP[dto.skuBand],
        onboardingDone: true,
        memberships: {
          create: { userId, roleId: ownerRole.id },
        },
        workspaces: {
          create: { name: 'Default Catalog', slug: 'default', isDefault: true },
        },
        locales: {
          create: [
            { code: 'en_US', label: 'English (US)', enabled: true },
          ],
        },
        channels: {
          create: {
            code: 'ecommerce',
            label: 'Ecommerce',
            locales: ['en_US'],
            activationStatus: 'active',
          },
        },
      },
      include: { workspaces: true },
    });

    await this.audit.log({
      organizationId: org.id,
      actorId: userId,
      action: 'organization.create',
      entityType: 'Organization',
      entityId: org.id,
      after: { name: org.name, slug: org.slug },
    });

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      workspace: org.workspaces[0],
    };
  }

  ssoStub() {
    return {
      status: 'not_implemented',
      message: 'SAML/OAuth SSO will be available in a future release. Use email/password for now.',
    };
  }
}
