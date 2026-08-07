import { BadRequestException, Injectable } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(organizationId: string, invitedById: string, email: string, roleName: RoleName) {
    const token = randomBytes(32).toString('hex');
    const invite = await this.prisma.invite.create({
      data: {
        organizationId,
        email: email.toLowerCase(),
        roleName,
        invitedById,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const url = `${process.env.APP_URL || 'http://localhost:3001'}/accept-invite?token=${token}`;
    console.log(`[DEV EMAIL] Invite ${email} to org ${organizationId}: ${url}`);
    await this.audit.log({
      organizationId,
      actorId: invitedById,
      action: 'invite.create',
      entityType: 'Invite',
      entityId: invite.id,
      after: { email, roleName },
    });
    return { id: invite.id, email: invite.email, roleName: invite.roleName };
  }

  async accept(token: string, name: string, password: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invite');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let user = await this.prisma.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          name,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
      });
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: invite.roleName } });
    await this.prisma.membership.upsert({
      where: {
        organizationId_userId: { organizationId: invite.organizationId, userId: user.id },
      },
      create: {
        organizationId: invite.organizationId,
        userId: user.id,
        roleId: role.id,
      },
      update: { roleId: role.id },
    });
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return { organizationId: invite.organizationId, email: user.email };
  }

  list(organizationId: string) {
    return this.prisma.invite.findMany({
      where: { organizationId, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
