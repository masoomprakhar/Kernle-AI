import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_HIERARCHY, RoleName } from '@kernle/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.isSuperAdmin) return true;

    const role = user.role as RoleName | undefined;
    if (!role) throw new ForbiddenException('No role in organization context');

    const userLevel = ROLE_HIERARCHY[role] ?? 0;
    const ok = required.some((r) => userLevel >= (ROLE_HIERARCHY[r] ?? 0));
    if (!ok) throw new ForbiddenException(`Requires role: ${required.join(' | ')}`);
    return true;
  }
}
