import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { IntelligenceService } from './intelligence.service';

class CreateTextSourceDto {
  @IsString() text!: string;
  @IsOptional() @IsString() productId?: string;
}

class CreateUrlSourceDto {
  @IsString() url!: string;
  @IsOptional() @IsString() productId?: string;
}

class ExtractDto {
  @IsString() familyId!: string;
  @IsArray() @IsString({ each: true }) sourceDocumentIds!: string[];
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() sku?: string;
}

class BulkIntelligenceRunDto {
  @IsArray() @IsString({ each: true }) productIds!: string[];
  @IsOptional() @IsString() sourceDocumentId?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() text?: string;
  /** When true (default), enqueue Phase 4 batch jobs; when false, run inline per product. */
  @IsOptional() @IsBoolean() async?: boolean;
}

function org(user: AuthUser) {
  if (!user.organizationId) throw new ForbiddenException('Organization context required');
  return user.organizationId;
}

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class IntelligenceController {
  constructor(private intelligence: IntelligenceService) {}

  @Get('sources')
  @Roles('Viewer')
  listSources(@CurrentUser() user: AuthUser, @Query('productId') productId?: string) {
    return this.intelligence.listSources(org(user), productId);
  }

  @Post('sources')
  @Roles('Contributor')
  createSource(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTextSourceDto & CreateUrlSourceDto & { type?: string },
  ) {
    const type = body.type || (body.url ? 'url' : 'text_paste');
    if (type === 'url' || body.url) {
      return this.intelligence.createUrlSource(org(user), user.id, body.url, body.productId);
    }
    return this.intelligence.createTextSource(org(user), user.id, body.text, body.productId);
  }

  @Post('sources/upload')
  @Roles('Contributor')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        productId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  uploadSource(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('productId') productId?: string,
  ) {
    return this.intelligence.createFileSource(org(user), user.id, file, productId || undefined);
  }

  @Post('extract')
  @Roles('Contributor')
  extract(@CurrentUser() user: AuthUser, @Body() dto: ExtractDto) {
    return this.intelligence.startExtraction(org(user), user.id, dto);
  }

  @Post('sources/:id/reprocess')
  @Roles('Contributor')
  reprocessSource(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.intelligence.reprocessSourceDocument(org(user), user.id, id);
  }

  @Post('intelligence/bulk-run')
  @Roles('CatalogManager')
  bulkRun(@CurrentUser() user: AuthUser, @Body() dto: BulkIntelligenceRunDto) {
    return this.intelligence.bulkIntelligenceRun(org(user), user.id, dto);
  }
}
