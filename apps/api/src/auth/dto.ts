import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class OnboardingDto {
  @IsString()
  companyName!: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsEnum(['Retail', 'B2B_Manufacturing', 'Fashion', 'Food_Beverage', 'Other'])
  useCase!: 'Retail' | 'B2B_Manufacturing' | 'Fashion' | 'Food_Beverage' | 'Other';

  @IsEnum(['lt_1k', '1k_10k', '10k_100k', '100k_plus'])
  skuBand!: 'lt_1k' | '1k_10k' | '10k_100k' | '100k_plus';
}
