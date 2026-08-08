import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { AiService } from './ai.service';

class AskDto {
  @IsString() message!: string;
  @IsOptional() @IsString() conversationId?: string;
}

class SuggestFillDto {
  @IsString() productId!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) attributeCodes?: string[];
}

class SuggestFillBatchDto {
  @IsString() familyId!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsNumber() limit?: number;
  @IsOptional() @IsBoolean() async?: boolean;
}

class QualityScanDto {
  @IsOptional() @IsString() familyId?: string;
  @IsOptional() @IsBoolean() async?: boolean;
}

class AcceptSuggestionDto {
  @IsOptional() editedValue?: unknown;
}

class MarketSignalDto {
  @IsString() sku!: string;
  @IsString() signalType!: string;
  @IsNumber() value!: number;
  @IsOptional() @IsObject() metadata?: object;
}

class CanonicalApplyDto {
  @IsArray()
  mapping!: Array<{ oldValue: string; canonicalValue: string }>;
  @IsOptional()
  updateAttributeOptions?: boolean;
}

class CompareDto {
  @IsArray() @IsString({ each: true }) productIds!: string[];
}

function org(user: AuthUser) {
  if (!user.organizationId) throw new ForbiddenException('Organization context required');
  return user.organizationId;
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Post('ask')
  @Roles('Contributor')
  ask(@CurrentUser() user: AuthUser, @Body() dto: AskDto) {
    return this.ai.ask(org(user), user.id, dto.message, dto.conversationId);
  }

  @Post('fill/suggest')
  @Roles('Contributor')
  suggestFill(@CurrentUser() user: AuthUser, @Body() dto: SuggestFillDto) {
    return this.ai.suggestFill(org(user), user.id, dto.productId, dto.attributeCodes);
  }

  @Post('fill/batch')
  @Roles('CatalogManager')
  suggestFillBatch(@CurrentUser() user: AuthUser, @Body() dto: SuggestFillBatchDto) {
    return this.ai.suggestFillBatch(org(user), user.id, dto);
  }

  @Get('suggestions')
  @Roles('Viewer')
  suggestions(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('grouped') grouped?: string,
  ) {
    if (grouped === 'true' || grouped === '1') {
      return this.ai.listSuggestionsGrouped(org(user), status || 'pending');
    }
    return this.ai.listSuggestions(org(user), status || 'pending', productId);
  }

  @Get('insights/accuracy')
  @Roles('Viewer')
  accuracy(@CurrentUser() user: AuthUser) {
    return this.ai.accuracyInsights(org(user));
  }

  @Post('suggestions/:id/accept')
  @Roles('Contributor')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcceptSuggestionDto,
  ) {
    return this.ai.acceptSuggestion(org(user), user.id, id, dto?.editedValue);
  }

  @Post('suggestions/:id/reject')
  @Roles('Contributor')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.rejectSuggestion(org(user), user.id, id);
  }

  @Post('quality/scan')
  @Roles('CatalogManager')
  qualityScan(@CurrentUser() user: AuthUser, @Body() body: QualityScanDto = {}) {
    return this.ai.enqueueQualityScan(org(user), user.id, body);
  }

  @Get('jobs/metrics')
  @Roles('Admin')
  jobMetrics(@CurrentUser() user: AuthUser) {
    void org(user);
    return this.ai.jobMetrics();
  }

  @Get('quality/findings')
  @Roles('Viewer')
  findings(@CurrentUser() user: AuthUser, @Query('resolved') resolved?: string) {
    return this.ai.listFindings(
      org(user),
      resolved === undefined ? undefined : resolved === 'true',
    );
  }

  @Post('quality/findings/:id/resolve')
  @Roles('Contributor')
  resolveFinding(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.resolveFinding(org(user), id);
  }

  @Post('quality/findings/:id/merge')
  @Roles('CatalogManager')
  mergeFinding(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.mergeFindingToCanonical(org(user), user.id, id);
  }

  @Post('attributes/:id/canonicalize/propose')
  @Roles('CatalogManager')
  proposeCanonical(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ai.proposeCanonicalization(org(user), user.id, id);
  }

  @Post('attributes/:id/canonicalize/apply')
  @Roles('CatalogManager')
  applyCanonical(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CanonicalApplyDto,
  ) {
    return this.ai.applyCanonicalization(
      org(user),
      user.id,
      id,
      dto.mapping,
      dto.updateAttributeOptions !== false,
    );
  }

  @Post('products/compare')
  @Roles('Viewer')
  compareProducts(@CurrentUser() user: AuthUser, @Body() dto: CompareDto) {
    return this.ai.compareProducts(org(user), dto.productIds);
  }

  @Get('market-signals')
  @Roles('Viewer')
  signals(@CurrentUser() user: AuthUser, @Query('sku') sku?: string) {
    return this.ai.listSignals(org(user), sku);
  }

  @Post('market-signals')
  @Roles('CatalogManager')
  createSignal(@CurrentUser() user: AuthUser, @Body() dto: MarketSignalDto) {
    return this.ai.createSignal(org(user), user.id, dto);
  }

  @Get('market-signals/correlation')
  @Roles('Viewer')
  correlation(@CurrentUser() user: AuthUser, @Query('signalType') signalType?: string) {
    return this.ai.correlationInsight(org(user), signalType);
  }

  @Get('usage')
  @Roles('Admin')
  usage(@CurrentUser() user: AuthUser) {
    return this.ai.listUsage(org(user));
  }
}
