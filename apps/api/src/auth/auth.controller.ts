import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  OnboardingDto,
  RefreshDto,
  ResetPasswordDto,
  SignupDto,
  VerifyEmailDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('verify-email')
  verify(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('onboarding')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  onboard(@CurrentUser() user: AuthUser, @Body() dto: OnboardingDto) {
    return this.auth.onboard(user.id, dto);
  }

  @Get('sso')
  sso() {
    return this.auth.ssoStub();
  }
}
