import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ImportExportService } from './import-export.service';

class ImportProfileDto {
  @IsString() name!: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsObject() columnMapping?: Record<string, string>;
  @IsOptional() @IsIn(['create_only', 'update_only', 'upsert']) updateBehavior?: 'create_only' | 'update_only' | 'upsert';
  @IsOptional() @IsString() scheduleCron?: string;
}

class ImportCsvDto {
  @IsString() csvText!: string;
  @IsOptional() @IsString() profileId?: string;
  @IsOptional() @IsObject() columnMapping?: Record<string, string>;
  @IsOptional() @IsIn(['create_only', 'update_only', 'upsert']) updateBehavior?: 'create_only' | 'update_only' | 'upsert';
}

class ExportCsvDto {
  @IsOptional() @IsObject() filter?: {
    familyId?: string;
    enabled?: boolean;
    categoryId?: string;
    search?: string;
  };
  @IsOptional() @IsArray() @IsString({ each: true }) fields?: string[];
  @IsOptional() @IsString() profileId?: string;
}

class ExportProfileDto {
  @IsString() name!: string;
  @IsOptional() @IsString() targetFormat?: string;
  @IsOptional() @IsObject() filter?: object;
  @IsOptional() @IsArray() @IsString({ each: true }) fieldSelection?: string[];
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() webhookUrl?: string;
}

function org(user: AuthUser) {
  if (!user.organizationId) throw new ForbiddenException('Organization context required');
  return user.organizationId;
}

@ApiTags('import-export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('import-export')
export class ImportExportController {
  constructor(private svc: ImportExportService) {}

  @Get('profiles')
  @Roles('Viewer')
  listProfiles(@CurrentUser() user: AuthUser) {
    return this.svc.listProfiles(org(user));
  }

  @Post('profiles')
  @Roles('CatalogManager')
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: ImportProfileDto) {
    return this.svc.createProfile(org(user), user.id, dto);
  }

  @Patch('profiles/:id')
  @Roles('CatalogManager')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<ImportProfileDto>,
  ) {
    return this.svc.updateProfile(org(user), user.id, id, dto);
  }

  @Delete('profiles/:id')
  @Roles('CatalogManager')
  deleteProfile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteProfile(org(user), user.id, id);
  }

  @Post('import/csv')
  @Roles('CatalogManager')
  importCsv(@CurrentUser() user: AuthUser, @Body() dto: ImportCsvDto) {
    return this.svc.importCsv(org(user), user.id, dto);
  }

  @Get('import/jobs')
  @Roles('Viewer')
  importJobs(@CurrentUser() user: AuthUser) {
    return this.svc.listImportJobs(org(user));
  }

  @Post('export/csv')
  @Roles('Contributor')
  exportCsv(@CurrentUser() user: AuthUser, @Body() dto: ExportCsvDto) {
    return this.svc.exportCsv(org(user), user.id, dto);
  }

  @Get('export/profiles')
  @Roles('Viewer')
  exportProfiles(@CurrentUser() user: AuthUser) {
    return this.svc.listExportProfiles(org(user));
  }

  @Post('export/profiles')
  @Roles('CatalogManager')
  createExportProfile(@CurrentUser() user: AuthUser, @Body() dto: ExportProfileDto) {
    return this.svc.createExportProfile(org(user), user.id, dto);
  }
}
