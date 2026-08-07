import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.workspace.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(organizationId: string, name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48);
    return this.prisma.workspace.create({
      data: { organizationId, name, slug },
    });
  }
}
