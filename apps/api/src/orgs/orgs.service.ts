import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrgsService {
  constructor(private prisma: PrismaService) {}

  async get(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    const memberCount = await this.prisma.membership.count({ where: { organizationId } });
    const skuCount = await this.prisma.product.count({ where: { organizationId } });
    return { ...org, memberCount, skuCount };
  }

  async members(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true, name: true, emailVerifiedAt: true } },
        role: true,
      },
    });
  }
}
