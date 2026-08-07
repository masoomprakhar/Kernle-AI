import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspaces: WorkspacesService) {}

  @Get()
  @Roles('Viewer')
  list(@CurrentUser() user: AuthUser) {
    return this.workspaces.list(user.organizationId!);
  }

  @Post()
  @Roles('Admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.organizationId!, dto.name);
  }
}
