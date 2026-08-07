import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { ForbiddenException } from '@nestjs/common';

class CheckoutDto {
  @IsString()
  @IsIn(['Growth', 'Enterprise'])
  plan!: 'Growth' | 'Enterprise';
}

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @Get('usage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Viewer')
  usage(@CurrentUser() user: AuthUser) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.billing.getUsage(user.organizationId);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Owner')
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    if (!user.organizationId) throw new ForbiddenException('Organization context required');
    return this.billing.createCheckoutSession(user.organizationId, user.id, dto.plan);
  }

  @Post('webhook')
  webhook(
    @Req() req: { body?: unknown; rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
    @Body() body?: unknown,
  ) {
    const raw =
      (req as any).rawBody ||
      (typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    return this.billing.handleWebhook(raw, signature);
  }
}
