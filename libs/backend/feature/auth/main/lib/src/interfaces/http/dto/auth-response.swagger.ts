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

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  roles!: string[];

  @ApiProperty({ items: { type: 'string' }, type: 'array' })
  permissions!: string[];
}

export class AuthenticatedUserViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'email', nullable: true, type: String })
  email!: string | null;

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

  @ApiPropertyOptional({ format: 'uri', maxLength: 2048, nullable: true, type: String })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    enum: ['none', 'provider', 'manual', 'deleted'],
  })
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';
}

export class AuthSessionViewDto {
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

export class ExternalAuthIdentityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: externalAuthProviders })
  provider!: string;

  @ApiProperty()
  providerSubject!: string;

  @ApiProperty({ enum: authProviderChannels })
  channel!: string;

  @ApiProperty({ format: 'email', nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ nullable: true, type: Boolean })
  emailVerified!: boolean | null;

  @ApiProperty({ nullable: true, type: String })
  displayName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  username!: string | null;

  @ApiProperty({ format: 'uri', nullable: true, type: String })
  avatarUrl!: string | null;

  @ApiProperty()
  linkedAt!: string;

  @ApiProperty({ nullable: true, type: String })
  lastAuthenticatedAt!: string | null;
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

  @ApiPropertyOptional({ type: () => ExternalAuthIdentityDto })
  identity?: ExternalAuthIdentityDto;

  @ApiPropertyOptional()
  returnUrl?: string;
}

export class DiscordAuthorizationRequestResultDto {
  @ApiProperty({ format: 'uri' })
  authorizationUrl!: string;

  @ApiProperty()
  stateExpiresAt!: string;
}

export class ProviderIdentitiesPayloadDto {
  @ApiProperty({ isArray: true, type: () => ExternalAuthIdentityDto })
  items!: ExternalAuthIdentityDto[];
}

export class UnlinkProviderIdentityPayloadDto {
  @ApiProperty()
  unlinked!: boolean;
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
