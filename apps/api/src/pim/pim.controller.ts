import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PimService, requireOrg } from './pim.service';

class LabelDto {
  [locale: string]: string;
}

class CreateAttributeDto {
  @IsString() code!: string;
  @IsObject() label!: LabelDto;
  @IsString() type!: string;
  @IsOptional() @IsBoolean() scopable?: boolean;
  @IsOptional() @IsBoolean() localizable?: boolean;
  @IsOptional() @IsObject() validationRules?: object;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsArray() options?: unknown[];
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class UpdateAttributeDto {
  @IsOptional() @IsObject() label?: LabelDto;
  @IsOptional() @IsObject() validationRules?: object;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsArray() options?: unknown[];
  @IsOptional() groupId?: string | null;
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsBoolean() archived?: boolean;
  @IsOptional() @IsBoolean() scopable?: boolean;
  @IsOptional() @IsBoolean() localizable?: boolean;
}

class CreateGroupDto {
  @IsString() code!: string;
  @IsObject() label!: LabelDto;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class CompletenessReqDto {
  @IsString() channel!: string;
  @IsString() locale!: string;
}

class FamilyAttrDto {
  @IsString() attributeId!: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletenessReqDto)
  requiredForCompleteness?: CompletenessReqDto[];
  @IsOptional() @IsNumber() sortOrder?: number;
}

class CreateFamilyDto {
  @IsString() code!: string;
  @IsObject() label!: LabelDto;
  @IsOptional() @IsString() labelAttributeCode?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FamilyAttrDto)
  attributes?: FamilyAttrDto[];
}

class UpdateFamilyDto {
  @IsOptional() @IsObject() label?: LabelDto;
  @IsOptional() @IsString() labelAttributeCode?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FamilyAttrDto)
  attributes?: FamilyAttrDto[];
}

class CreateCategoryDto {
  @IsString() code!: string;
  @IsObject() label!: LabelDto;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class ReorderItemDto {
  @IsString() id!: string;
  @IsNumber() sortOrder!: number;
  @IsOptional() parentId?: string | null;
}

class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}

class BulkMoveDto {
  @IsArray() @IsString({ each: true }) productIds!: string[];
  @IsString() categoryId!: string;
  @IsOptional() @IsString() mode?: 'add' | 'replace';
}

class CreateProductDto {
  @IsString() sku!: string;
  @IsOptional() @IsString() familyId?: string;
  @IsOptional() @IsString() productModelId?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsObject() values?: Record<string, any>;
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
}

class UpdateProductDto {
  @IsOptional() @IsObject() values?: Record<string, any>;
  @IsOptional() @IsBoolean() merge?: boolean;
  @IsOptional() @IsString() familyId?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() sku?: string;
}

class BulkEnableDto {
  @IsArray() @IsString({ each: true }) productIds!: string[];
  @IsBoolean() enabled!: boolean;
}

class AssignCategoriesDto {
  @IsArray() @IsString({ each: true }) categoryIds!: string[];
  @IsOptional() @IsString() mode?: 'replace' | 'add';
}

class CreateProductModelDto {
  @IsString() code!: string;
  @IsString() familyId!: string;
  @IsArray() @IsString({ each: true }) variantAxes!: string[];
  @IsOptional() @IsObject() sharedValues?: Record<string, any>;
}

class CreateChannelDto {
  @IsString() code!: string;
  @IsString() label!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) locales?: string[];
  @IsOptional() @IsString() categoryTreeId?: string;
  @IsOptional() @IsString() connectorType?: string;
  @IsOptional() @IsString() credentialsEnc?: string;
  @IsOptional() @IsObject() fieldMapping?: object;
  @IsOptional() @IsObject() categoryMapping?: object;
  @IsOptional() @IsBoolean() autoSync?: boolean;
}

class CreateLocaleDto {
  @IsString() code!: string;
  @IsString() label!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

@ApiTags('pim')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pim')
export class PimController {
  constructor(private pim: PimService) {}

  // Attributes
  @Get('attributes')
  @Roles('Viewer')
  listAttributes(@CurrentUser() user: AuthUser, @Query('includeArchived') includeArchived?: string) {
    return this.pim.listAttributes(requireOrg(user.organizationId), includeArchived === 'true');
  }

  @Post('attributes')
  @Roles('CatalogManager')
  createAttribute(@CurrentUser() user: AuthUser, @Body() dto: CreateAttributeDto) {
    return this.pim.createAttribute(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('attributes/:id')
  @Roles('CatalogManager')
  updateAttribute(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAttributeDto,
  ) {
    return this.pim.updateAttribute(requireOrg(user.organizationId), user.id, id, dto);
  }

  @Delete('attributes/:id')
  @Roles('CatalogManager')
  deleteAttribute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.deleteAttribute(requireOrg(user.organizationId), user.id, id);
  }

  // Attribute groups
  @Get('attribute-groups')
  @Roles('Viewer')
  listGroups(@CurrentUser() user: AuthUser) {
    return this.pim.listAttributeGroups(requireOrg(user.organizationId));
  }

  @Post('attribute-groups')
  @Roles('CatalogManager')
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.pim.createAttributeGroup(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('attribute-groups/:id')
  @Roles('CatalogManager')
  updateGroup(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.pim.updateAttributeGroup(requireOrg(user.organizationId), user.id, id, dto);
  }

  @Delete('attribute-groups/:id')
  @Roles('CatalogManager')
  deleteGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.deleteAttributeGroup(requireOrg(user.organizationId), user.id, id);
  }

  // Families
  @Get('families')
  @Roles('Viewer')
  listFamilies(@CurrentUser() user: AuthUser) {
    return this.pim.listFamilies(requireOrg(user.organizationId));
  }

  @Get('families/:id')
  @Roles('Viewer')
  getFamily(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.getFamily(requireOrg(user.organizationId), id);
  }

  @Post('families')
  @Roles('CatalogManager')
  createFamily(@CurrentUser() user: AuthUser, @Body() dto: CreateFamilyDto) {
    return this.pim.createFamily(requireOrg(user.organizationId), user.id, dto);
  }

  @Put('families/:id')
  @Roles('CatalogManager')
  updateFamily(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFamilyDto,
  ) {
    return this.pim.updateFamily(requireOrg(user.organizationId), user.id, id, dto);
  }

  @Delete('families/:id')
  @Roles('CatalogManager')
  deleteFamily(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.deleteFamily(requireOrg(user.organizationId), user.id, id);
  }

  // Categories
  @Get('categories')
  @Roles('Viewer')
  listCategories(@CurrentUser() user: AuthUser, @Query('tree') tree?: string) {
    return this.pim.listCategories(requireOrg(user.organizationId), tree !== 'false');
  }

  @Post('categories')
  @Roles('CatalogManager')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.pim.createCategory(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('categories/:id')
  @Roles('CatalogManager')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCategoryDto> & { parentId?: string | null },
  ) {
    return this.pim.updateCategory(requireOrg(user.organizationId), user.id, id, dto);
  }

  @Post('categories/reorder')
  @Roles('CatalogManager')
  reorder(@CurrentUser() user: AuthUser, @Body() dto: ReorderCategoriesDto) {
    return this.pim.reorderCategories(requireOrg(user.organizationId), user.id, dto.items);
  }

  @Post('categories/bulk-move')
  @Roles('CatalogManager')
  bulkMove(@CurrentUser() user: AuthUser, @Body() dto: BulkMoveDto) {
    return this.pim.bulkMoveProducts(requireOrg(user.organizationId), user.id, dto);
  }

  @Delete('categories/:id')
  @Roles('CatalogManager')
  deleteCategory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.deleteCategory(requireOrg(user.organizationId), user.id, id);
  }

  // Products
  @Get('products')
  @Roles('Viewer')
  listProducts(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('familyId') familyId?: string,
    @Query('enabled') enabled?: string,
    @Query('categoryId') categoryId?: string,
    @Query('minCompleteness') minCompleteness?: string,
    @Query('channel') channel?: string,
    @Query('locale') locale?: string,
  ) {
    return this.pim.listProducts(requireOrg(user.organizationId), {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      familyId,
      enabled: enabled === undefined ? undefined : enabled === 'true',
      categoryId,
      minCompleteness: minCompleteness ? Number(minCompleteness) : undefined,
      channel,
      locale,
    });
  }

  @Get('products/:id')
  @Roles('Viewer')
  getProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.getProduct(requireOrg(user.organizationId), id);
  }

  @Post('products')
  @Roles('Contributor')
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.pim.createProduct(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('products/:id')
  @Roles('Contributor')
  updateProduct(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.pim.updateProductValues(requireOrg(user.organizationId), user.id, id, dto);
  }

  @Post('products/bulk-enable')
  @Roles('CatalogManager')
  bulkEnable(@CurrentUser() user: AuthUser, @Body() dto: BulkEnableDto) {
    return this.pim.bulkSetEnabled(
      requireOrg(user.organizationId),
      user.id,
      dto.productIds,
      dto.enabled,
    );
  }

  @Post('products/:id/categories')
  @Roles('Contributor')
  assignCategories(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssignCategoriesDto,
  ) {
    return this.pim.assignCategories(
      requireOrg(user.organizationId),
      user.id,
      id,
      dto.categoryIds,
      dto.mode || 'replace',
    );
  }

  @Post('products/:id/recompute-completeness')
  @Roles('Contributor')
  recompute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.recomputeCompleteness(requireOrg(user.organizationId), id);
  }

  @Delete('products/:id')
  @Roles('CatalogManager')
  deleteProduct(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.deleteProduct(requireOrg(user.organizationId), user.id, id);
  }

  // Product models
  @Get('product-models')
  @Roles('Viewer')
  listModels(@CurrentUser() user: AuthUser) {
    return this.pim.listProductModels(requireOrg(user.organizationId));
  }

  @Post('product-models')
  @Roles('CatalogManager')
  createModel(@CurrentUser() user: AuthUser, @Body() dto: CreateProductModelDto) {
    return this.pim.createProductModel(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('product-models/:id')
  @Roles('CatalogManager')
  updateModel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateProductModelDto>,
  ) {
    return this.pim.updateProductModel(requireOrg(user.organizationId), user.id, id, dto);
  }

  @Post('product-models/:id/generate-variants')
  @Roles('CatalogManager')
  generateVariants(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.pim.generateVariants(requireOrg(user.organizationId), user.id, id);
  }

  // Channels
  @Get('channels')
  @Roles('Viewer')
  listChannels(@CurrentUser() user: AuthUser) {
    return this.pim.listChannels(requireOrg(user.organizationId));
  }

  @Post('channels')
  @Roles('Admin')
  createChannel(@CurrentUser() user: AuthUser, @Body() dto: CreateChannelDto) {
    return this.pim.createChannel(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('channels/:id')
  @Roles('Admin')
  updateChannel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateChannelDto> & { activationStatus?: string; paused?: boolean },
  ) {
    return this.pim.updateChannel(requireOrg(user.organizationId), user.id, id, dto);
  }

  // Locales
  @Get('locales')
  @Roles('Viewer')
  listLocales(@CurrentUser() user: AuthUser) {
    return this.pim.listLocales(requireOrg(user.organizationId));
  }

  @Post('locales')
  @Roles('Admin')
  createLocale(@CurrentUser() user: AuthUser, @Body() dto: CreateLocaleDto) {
    return this.pim.createLocale(requireOrg(user.organizationId), user.id, dto);
  }

  @Patch('locales/:id')
  @Roles('Admin')
  updateLocale(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateLocaleDto>,
  ) {
    return this.pim.updateLocale(requireOrg(user.organizationId), user.id, id, dto);
  }
}
