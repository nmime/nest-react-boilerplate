// Module-private Swagger response DTOs. These describe the response envelopes
// for OpenAPI only; they are imported directly by the controller and are
// intentionally NOT barrelled (not part of the public API).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { supportedLocales } from '@app/backend-common-i18n';
import {
  authProviderChannels,
  authProviders,
  externalAuthIntents,
  externalAuthProviders,
  userThemePreferences,
} from '@app/backend-feature-auth-shared';

export class AuthenticatedPrincipalDto {
  @ApiProperty()
  subject!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiPropertyOptional({ format: 'email' })
  email?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiPropertyOptional({ enum: userThemePreferences })
  theme?: string;

  @ApiPropertyOptional()
  issuer?: string;

  @ApiPropertyOptional({
    oneOf: [{ type: 'string' }, { items: { type: 'string' }, type: 'array' }],
  })
  audience?: string | string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  roles!: string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  permissions!: string[];

  @ApiPropertyOptional()
  tokenId?: string;
}

export class AuthenticatedUserViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiProperty({ enum: userThemePreferences })
  theme!: string;

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  roles!: string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  permissions!: string[];

  @ApiPropertyOptional({ format: 'uri', maxLength: 2048 })
  avatarUrl?: string;

  @ApiPropertyOptional({
    enum: ['none', 'provider', 'manual', 'deleted'],
  })
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';
}

export class AuthSessionViewDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';

  @ApiProperty()
  expiresIn!: number;

  @ApiPropertyOptional({ writeOnly: true })
  refreshToken?: string;

  @ApiProperty({ type: () => AuthenticatedUserViewDto })
  user!: AuthenticatedUserViewDto;

  @ApiPropertyOptional({ items: { type: 'string' }, type: 'array' })
  amr?: string[];

  @ApiPropertyOptional({ enum: authProviders })
  authProvider?: string;

  @ApiPropertyOptional({ enum: authProviderChannels })
  authChannel?: string;

  @ApiPropertyOptional()
  authTime?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  externalIdentityId?: string;
}

export class ExternalAuthResultDto {
  @ApiProperty({ enum: ['authenticated', 'linked', 'needs_link', 'conflict'] })
  status!: string;

  @ApiPropertyOptional()
  code?: string;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ type: () => AuthSessionViewDto })
  session?: AuthSessionViewDto;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  identity?: unknown;

  @ApiPropertyOptional()
  returnUrl?: string;
}

export class LinkTokenResultDto {
  @ApiProperty({ writeOnly: true })
  token!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({ enum: externalAuthProviders })
  provider!: string;

  @ApiProperty({ enum: externalAuthIntents })
  intent!: string;
}

export class UserActionTokenPayloadDto {
  @ApiProperty()
  issued!: boolean;
}

export class MePayloadDto {
  @ApiProperty({ type: () => AuthenticatedPrincipalDto })
  principal!: AuthenticatedPrincipalDto;

  @ApiProperty({ nullable: true, type: () => AuthenticatedUserViewDto })
  user!: AuthenticatedUserViewDto | null;
}

export class SupportedLocalesPayloadDto {
  @ApiProperty({ enum: supportedLocales, isArray: true })
  supportedLocales!: typeof supportedLocales;
}

export class LogoutPayloadDto {
  @ApiProperty({ enum: [true] })
  loggedOut!: true;
}
