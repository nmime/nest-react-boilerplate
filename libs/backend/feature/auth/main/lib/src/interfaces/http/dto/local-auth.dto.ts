import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { supportedLocales } from '@app/common-i18n';
import { userThemePreferences } from '@app/backend-feature-auth-shared';

export class RegisterDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  @IsOptional()
  @IsString()
  @IsIn(supportedLocales)
  locale?: string;
}

export class LoginDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(16)
  refreshToken!: string;
}

export class UserActionTokenRequestDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @IsEmail()
  email!: string;
}

export class UpdateLocaleDto {
  @ApiProperty({ enum: supportedLocales })
  @IsString()
  @IsIn(supportedLocales)
  locale!: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: supportedLocales })
  @IsOptional()
  @IsString()
  @IsIn(supportedLocales)
  locale?: string;

  @ApiPropertyOptional({ enum: userThemePreferences })
  @IsOptional()
  @IsString()
  @IsIn(userThemePreferences)
  theme?: string;
}
