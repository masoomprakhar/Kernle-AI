import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DamService } from './dam.service';

class UpdateAssetDto {
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() categoryId?: string | null;
  @IsOptional() @IsObject() metadata?: object;
}

class LinkProductDto {
  @IsString() productId!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class ExportZipDto {
  @IsArray() @IsString({ each: true }) assetIds!: string[];
}

@ApiTags('dam')
@Controller('dam')
export class DamController {
  constructor(private dam: DamService) {}

  @Get('assets')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Viewer')
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('mimeType') mimeType?: string,
    @Query('tag') tag?: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.list(user.organizationId, {
      search,
      mimeType,
      tag,
      categoryId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('assets/upload')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Contributor')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        tags: { type: 'string' },
        categoryId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('tags') tags?: string,
    @Body('categoryId') categoryId?: string,
  ) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    const tagList = tags
      ? tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    return this.dam.upload(user.organizationId, user.id, file, {
      tags: tagList,
      categoryId,
    });
  }

  @Get('assets/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Viewer')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.get(user.organizationId, id);
  }

  @Patch('assets/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Contributor')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.update(user.organizationId, user.id, id, dto);
  }

  @Post('assets/:id/link')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Contributor')
  link(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LinkProductDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.linkProduct(user.organizationId, user.id, id, dto);
  }

  @Delete('links/:linkId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Contributor')
  unlink(@CurrentUser() user: AuthUser, @Param('linkId') linkId: string) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.unlinkProduct(user.organizationId, user.id, linkId);
  }

  @Post('export-zip')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Contributor')
  exportZip(@CurrentUser() user: AuthUser, @Body() dto: ExportZipDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.exportZipStub(user.organizationId, dto.assetIds);
  }

  @Post('assets/:id/suggest-tags')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Contributor')
  suggestTags(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.suggestTags(user.organizationId, id);
  }

  @Delete('assets/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CatalogManager')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.dam.delete(user.organizationId, user.id, id);
  }

  /** Public signed-URL file serve (no JWT). */
  @Get('files/:key')
  async file(
    @Param('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const buf = await this.dam.readFile(decodeURIComponent(key), expires, sig);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buf);
  }
}
