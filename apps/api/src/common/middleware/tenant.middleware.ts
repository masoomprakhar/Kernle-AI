import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const host = (req.headers.host || '').split(':')[0];
    const root = process.env.ROOT_DOMAIN || 'localhost';
    let slug: string | undefined;

    if (host.endsWith(`.${root}`) && host !== root) {
      slug = host.replace(`.${root}`, '').split('.')[0];
    }

    const headerOrg = req.headers['x-organization-id'] as string | undefined;
    const headerWorkspace = req.headers['x-workspace-id'] as string | undefined;

    if (slug) {
      const org = await this.prisma.organization.findUnique({ where: { slug } });
      if (org) {
        (req as any).tenantSlug = slug;
        (req as any).tenantOrganizationId = org.id;
      }
    }

    if (headerOrg) {
      (req as any).tenantOrganizationId = headerOrg;
    }
    if (headerWorkspace) {
      (req as any).tenantWorkspaceId = headerWorkspace;
    }

    next();
  }
}
