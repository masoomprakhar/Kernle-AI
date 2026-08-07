import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';

class FeatureFlagsDto {
  @IsObject()
  featureFlags!: Record<string, unknown>;
}

class ImpersonateDto {
  @IsOptional() @IsString() targetUserId?: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('orgs')
  listOrgs(@CurrentUser() user: AuthUser) {
    return this.admin.listOrgs(user);
  }

  @Post('orgs/:organizationId/impersonate')
  impersonate(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: ImpersonateDto,
  ) {
    return this.admin.impersonateNote(user, organizationId, dto.targetUserId);
  }

  @Patch('orgs/:organizationId/feature-flags')
  updateFlags(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: FeatureFlagsDto,
  ) {
    return this.admin.updateFeatureFlags(user, organizationId, dto.featureFlags);
  }
}
