import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrgsService } from './orgs.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('orgs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private orgs: OrgsService) {}

  @Get('current')
  @Roles('Viewer')
  current(@CurrentUser() user: AuthUser) {
    return this.orgs.get(user.organizationId!);
  }

  @Get('members')
  @Roles('Admin')
  members(@CurrentUser() user: AuthUser) {
    return this.orgs.members(user.organizationId!);
  }
}
