import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  email: string;
  organizationId?: string;
  workspaceId?: string;
  role?: string;
  isSuperAdmin?: boolean;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user;
});
