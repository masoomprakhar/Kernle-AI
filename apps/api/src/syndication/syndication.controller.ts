import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SyndicationService } from './syndication.service';

class EnqueueDto {
  @IsOptional() @IsArray() @IsString({ each: true }) productIds?: string[];
}

class RuleDto {
  @IsOptional() @IsBoolean() requireEnabled?: boolean;
  @IsOptional() @IsNumber() minCompleteness?: number;
  @IsOptional() @IsObject() filter?: object;
}

function org(user: AuthUser) {
  if (!user.organizationId) throw new ForbiddenException('Organization context required');
  return user.organizationId;
}

@ApiTags('syndication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('syndication')
export class SyndicationController {
  constructor(private syndication: SyndicationService) {}

  @Get('dashboard')
  @Roles('Viewer')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.syndication.dashboard(org(user));
  }

  @Get('channels/:channelId/readiness')
  @Roles('Viewer')
  readiness(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Query('productId') productId?: string,
  ) {
    return this.syndication.readiness(org(user), channelId, productId);
  }

  @Post('channels/:channelId/sync')
  @Roles('CatalogManager')
  enqueue(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Body() dto: EnqueueDto,
  ) {
    return this.syndication.enqueueSync(org(user), user.id, channelId, dto.productIds);
  }

  @Post('channels/:channelId/force-resync')
  @Roles('CatalogManager')
  forceResync(@CurrentUser() user: AuthUser, @Param('channelId') channelId: string) {
    return this.syndication.forceResync(org(user), user.id, channelId);
  }

  @Put('channels/:channelId/rules')
  @Roles('Admin')
  upsertRule(
    @CurrentUser() user: AuthUser,
    @Param('channelId') channelId: string,
    @Body() dto: RuleDto,
  ) {
    return this.syndication.upsertRule(org(user), channelId, dto);
  }

  @Get('logs')
  @Roles('Viewer')
  logs(@CurrentUser() user: AuthUser, @Query('channelId') channelId?: string) {
    return this.syndication.listLogs(org(user), channelId);
  }
}
