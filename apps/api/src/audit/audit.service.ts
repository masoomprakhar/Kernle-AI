import { Injectable } from '@nestjs/common';
import { Prisma } from '@kernle/db';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: {
    organizationId: string;
    actorId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: (input.before as Prisma.InputJsonValue) ?? undefined,
        after: (input.after as Prisma.InputJsonValue) ?? undefined,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  list(organizationId: string, take = 50) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { id: true, email: true, name: true } } },
    });
  }
}
