import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { RoleName } from '@prisma/client';
import { InvitesService } from './invites.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(RoleName)
  roleName!: RoleName;
}

class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.invites.create(user.organizationId!, user.id, dto.email, dto.roleName);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  list(@CurrentUser() user: AuthUser) {
    return this.invites.list(user.organizationId!);
  }

  @Post('accept')
  accept(@Body() dto: AcceptInviteDto) {
    return this.invites.accept(dto.token, dto.name, dto.password);
  }
}
