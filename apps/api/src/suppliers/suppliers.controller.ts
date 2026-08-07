import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SuppliersService } from './suppliers.service';

class CreateSupplierDto {
  @IsString() name!: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsObject() contactInfo?: object;
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
}

class UpdateSupplierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsObject() contactInfo?: object;
  @IsOptional() @IsArray() @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsBoolean() rotateToken?: boolean;
}

class PortalSubmitDto {
  @IsString() productSku!: string;
  @IsObject() submittedValues!: Record<string, any>;
}

class ReviewDto {
  @IsOptional() @IsString() note?: string;
}

function org(user: AuthUser) {
  if (!user.organizationId) throw new ForbiddenException('Organization context required');
  return user.organizationId;
}

@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliers: SuppliersService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Viewer')
  list(@CurrentUser() user: AuthUser) {
    return this.suppliers.list(org(user));
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliers.create(org(user), user.id, dto);
  }

  // Static paths before :id
  @Get('review/queue')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CatalogManager')
  reviewQueue(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.suppliers.listReviewQueue(org(user), status);
  }

  @Post('review/:id/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CatalogManager')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.suppliers.approve(org(user), user.id, id, dto.note);
  }

  @Post('review/:id/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CatalogManager')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.suppliers.reject(org(user), user.id, id, dto.note);
  }

  @Get('portal/products')
  @ApiHeader({ name: 'x-portal-token', required: true })
  portalProducts(@Headers('x-portal-token') token: string, @Query('token') queryToken?: string) {
    return this.suppliers.portalListProducts(token || queryToken || '');
  }

  @Post('portal/submit')
  @ApiHeader({ name: 'x-portal-token', required: true })
  portalSubmit(
    @Headers('x-portal-token') token: string,
    @Body() dto: PortalSubmitDto,
    @Query('token') queryToken?: string,
  ) {
    return this.suppliers.portalSubmit(token || queryToken || '', dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliers.update(org(user), user.id, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.suppliers.delete(org(user), user.id, id);
  }
}
