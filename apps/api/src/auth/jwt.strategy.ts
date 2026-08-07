import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret-min-32-chars!!',
      passReqToCallback: true,
    });
  }

  async validate(
    req: any,
    payload: { sub: string; email: string; organizationId?: string },
  ): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    const orgId =
      (req.headers['x-organization-id'] as string) ||
      req.tenantOrganizationId ||
      payload.organizationId;

    let role: string | undefined;
    if (orgId) {
      const membership = await this.prisma.membership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
        include: { role: true },
      });
      if (!membership && !user.isSuperAdmin) {
        throw new UnauthorizedException('Not a member of this organization');
      }
      role = membership?.role.name;
    }

    return {
      id: user.id,
      email: user.email,
      organizationId: orgId,
      workspaceId: (req.headers['x-workspace-id'] as string) || req.tenantWorkspaceId,
      role,
      isSuperAdmin: user.isSuperAdmin,
    };
  }
}
