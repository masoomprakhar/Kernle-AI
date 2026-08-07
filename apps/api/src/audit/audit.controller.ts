import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @Roles('Admin', 'Owner')
  list(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    if (!user.organizationId) return [];
    return this.audit.list(user.organizationId, take ? Number(take) : 50);
  }
}
