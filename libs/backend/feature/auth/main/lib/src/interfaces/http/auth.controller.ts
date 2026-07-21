import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { supportedLocales } from '@app/backend-common-i18n';
import { ApiOkDataResponse, ApiExceptions, ApiProblemTypes, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import {
  CurrentUser,
  setSessionPrincipal,
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type AuthenticatedResponse,
  type AuthSessionView,
  type ExternalAuthIdentityView,
} from '@app/backend-feature-auth-shared';
import {
  AuthService,
  AuthLoginAnalyticsService,
  BetterAuthTelegramSessionService,
  ExternalAuthService,
  type ExternalAuthLoginResult,
} from '../../application';
import {
  DiscordAuthorizationRequestDto,
  DiscordCallbackQueryDto,
  LinkTokenDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  TelegramBotLinkDto,
  TelegramOidcSessionDto,
  TelegramTmaDto,
  UpdateLocaleDto,
  UpdatePreferencesDto,
  UserActionTokenRequestDto,
} from './dto';
import {
  AuthenticatedUserViewDto,
  AuthSessionViewDto,
  DiscordAuthorizationRequestResultDto,
  ExternalAuthResultDto,
  LinkTokenResultDto,
  LogoutPayloadDto,
  MePayloadDto,
  ProviderIdentitiesPayloadDto,
  SupportedLocalesPayloadDto,
  UnlinkProviderIdentityPayloadDto,
  UserActionTokenPayloadDto,
} from './dto/auth-response.swagger';
import type { LogoutPayload, MePayload, SupportedLocalesPayload, UserActionTokenPayload } from './type/auth-http.type';
import {
  callSessionMethod,
  clearRequestSession,
  establishExternalSessionIfPresent,
  establishRequestSession,
  SessionCookieName,
} from './util/session-lifecycle.util';
import { principalFromUserView } from './util/principal.mapper';

// The request DTOs, public payload interfaces, and the session-cookie name were
// decomposed into role-based sibling files; they are re-exported here so the
// HTTP barrel stays stable. The module-private Swagger response DTOs are
// imported directly and intentionally not re-exported.
export * from './dto';
export * from './type/auth-http.type';
export { SessionCookieName };

function hasRefreshTokenInput(input: Partial<RefreshTokenDto> | undefined): input is RefreshTokenDto {
  return typeof input?.refreshToken === 'string';
}

@ApiExceptions(400, 401, 403, 409, 429, 500)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly externalAuth: ExternalAuthService,
    private readonly betterAuthTelegramSession: BetterAuthTelegramSessionService,
    @Optional()
    @Inject(AuthLoginAnalyticsService)
    private readonly loginAnalytics: Pick<AuthLoginAnalyticsService, 'record'> = NoopAuthLoginAnalytics,
  ) {}

  @Post('register')
  @ApiOkDataResponse(AuthSessionViewDto)
  async register(
    @Body() input: RegisterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView>> {
    try {
      const session = await this.auth.register(input);
      await establishRequestSession(request, session);
      await this.loginAnalytics.record({
        request,
        tenantId: session.user.tenantId,
        userId: session.user.id,
        identifier: input.email,
        eventType: 'registration',
        outcome: 'success',
        provider: 'password',
        channel: 'password',
        language: session.user.locale,
      });
      return createOkResponse(session);
    } catch (error) {
      await this.loginAnalytics.record({
        request,
        tenantId: input.tenantId,
        identifier: input.email,
        eventType: 'registration',
        outcome: 'failure',
        provider: 'password',
        channel: 'password',
        failureCode: 'registration_failed',
      });
      throw error;
    }
  }

  @Post('login')
  @ApiOkDataResponse(AuthSessionViewDto)
  async login(@Body() input: LoginDto, @Req() request: AuthenticatedRequest): Promise<OkResponse<AuthSessionView>> {
    try {
      const session = await this.auth.login(input);
      await establishRequestSession(request, session);
      await this.loginAnalytics.record({
        request,
        tenantId: session.user.tenantId,
        userId: session.user.id,
        identifier: input.email,
        eventType: 'login',
        outcome: 'success',
        provider: 'password',
        channel: 'password',
        language: session.user.locale,
      });
      return createOkResponse(session);
    } catch (error) {
      await this.loginAnalytics.record({
        request,
        tenantId: input.tenantId,
        identifier: input.email,
        eventType: 'login',
        outcome: 'failure',
        provider: 'password',
        channel: 'password',
        failureCode: 'credentials_rejected',
      });
      throw error;
    }
  }

  @Post('refresh')
  @ApiOkDataResponse(AuthSessionViewDto)
  async refresh(
    @Body() input: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView>> {
    const session = await this.auth.refreshSession(input);
    await establishRequestSession(request, session);
    return createOkResponse(session);
  }

  @Post('telegram/tma')
  @ApiOkDataResponse(ExternalAuthResultDto)
  async telegramTma(
    @Body() input: TelegramTmaDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<ExternalAuthLoginResult>> {
    try {
      const betterAuthProfile = await this.betterAuthTelegramSession.requireTelegramProfile(request.headers);
      const result = await this.externalAuth.telegramTma({
        ...input,
        betterAuthProviderSubject: betterAuthProfile.providerSubject,
        principal: request.user ?? request.auth ?? null,
      });
      await establishExternalSessionIfPresent(request, result);
      if (result.session) {
        await this.recordExternalLogin(request, result.session, 'telegram', 'telegram_tma');
      }
      return createOkResponse(result);
    } catch (error) {
      await this.recordExternalFailure(request, input.tenantId, 'telegram', 'telegram_tma');
      throw error;
    }
  }

  @Post('telegram/oidc/session')
  @ApiOkDataResponse(ExternalAuthResultDto)
  async telegramOidcSession(
    @Body() input: TelegramOidcSessionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<ExternalAuthLoginResult>> {
    try {
      const profile = await this.betterAuthTelegramSession.requireTelegramProfile(request.headers);
      const result = await this.externalAuth.telegramOidcSession({
        ...input,
        principal: request.user ?? request.auth ?? null,
        profile,
      });
      await establishExternalSessionIfPresent(request, result);
      if (result.session) {
        await this.recordExternalLogin(request, result.session, 'telegram', 'telegram_oidc');
      }
      return createOkResponse(result);
    } catch (error) {
      await this.recordExternalFailure(request, input.tenantId, 'telegram', 'telegram_oidc');
      throw error;
    }
  }

  @Post('telegram/bot-link')
  @ApiOkDataResponse(ExternalAuthResultDto)
  async telegramBotLink(@Body() input: TelegramBotLinkDto): Promise<OkResponse<ExternalAuthLoginResult>> {
    return createOkResponse(await this.externalAuth.telegramBotLink(input));
  }

  @Post('discord/authorization-request')
  @ApiOkDataResponse(DiscordAuthorizationRequestResultDto)
  discordAuthorizationRequest(
    @Body() input: DiscordAuthorizationRequestDto,
    @Req() request: AuthenticatedRequest,
  ): OkResponse<{ authorizationUrl: string; stateExpiresAt: string }> {
    return createOkResponse(
      this.externalAuth.createDiscordAuthorizationRequest({
        ...input,
        principal: request.user ?? request.auth ?? null,
      }),
    );
  }

  @Get('discord/callback')
  @ApiOkDataResponse(ExternalAuthResultDto)
  async discordCallback(
    @Query() input: DiscordCallbackQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: AuthenticatedResponse,
  ): Promise<void> {
    try {
      const result = await this.externalAuth.discordCallback({
        ...input,
        principal: request.user ?? request.auth ?? null,
      });
      await establishExternalSessionIfPresent(request, result);
      if (result.session) {
        await this.recordExternalLogin(request, result.session, 'discord', 'discord_oauth');
      }
      if (result.returnUrl) {
        response.redirect?.(result.returnUrl, 302);
        return;
      }
      response.send?.(createOkResponse(result));
    } catch (error) {
      await this.recordExternalFailure(request, input.tenantId, 'discord', 'discord_oauth');
      throw error;
    }
  }

  @Get('provider-identities')
  @ApiOkDataResponse(ProviderIdentitiesPayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async providerIdentities(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<{ items: ExternalAuthIdentityView[] }>> {
    const items = await this.externalAuth.listProviderIdentities(principal.subject, principal.tenantId);

    return createOkResponse({ items });
  }

  @Delete('provider-identities/:identityId')
  @ApiOkDataResponse(UnlinkProviderIdentityPayloadDto)
  @ApiProblemTypes('step-up-required', 'last-auth-method-unlink-forbidden')
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async unlinkProviderIdentity(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('identityId') identityId: string,
  ): Promise<OkResponse<{ unlinked: boolean }>> {
    return createOkResponse(await this.externalAuth.unlinkProviderIdentity(identityId, principal));
  }

  @Post('link-tokens')
  @ApiOkDataResponse(LinkTokenResultDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async createLinkToken(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: LinkTokenDto,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(
      await this.externalAuth.createLinkToken({
        ...input,
        userId: principal.subject,
        // Link-token creation is authenticated; bind the token to the caller's
        // own tenant. A body-supplied tenantId must never override the
        // principal's tenant, matching every other authenticated endpoint and
        // preserving tenant confinement.
        tenantId: principal.tenantId,
      }),
    );
  }

  @Post('email-verification-token')
  @ApiOkDataResponse(UserActionTokenPayloadDto)
  async requestEmailVerification(
    @Body() input: UserActionTokenRequestDto,
  ): Promise<OkResponse<UserActionTokenPayload>> {
    await this.auth.issueEmailVerificationToken(input);
    return createOkResponse({ issued: true });
  }

  @Post('password-reset-token')
  @ApiOkDataResponse(UserActionTokenPayloadDto)
  async requestPasswordReset(@Body() input: UserActionTokenRequestDto): Promise<OkResponse<UserActionTokenPayload>> {
    await this.auth.issuePasswordResetToken(input);
    return createOkResponse({ issued: true });
  }

  @Get('me')
  @ApiOkDataResponse(MePayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async me(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<MePayload>> {
    return createOkResponse({
      principal,
      user: await this.auth.getUserById(principal.subject, principal.tenantId),
    });
  }

  @Patch('me/locale')
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async updateLocale(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdateLocaleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView['user']>> {
    const user = await this.auth.updateUserPreferences(principal.subject, principal.tenantId, { locale: input.locale });
    setSessionPrincipal(request, principalFromUserView(principal, user));
    await callSessionMethod(request, 'save');
    return createOkResponse(user);
  }

  @Patch('me/preferences')
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async updatePreferences(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdatePreferencesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView['user']>> {
    const user = await this.auth.updateUserPreferences(principal.subject, principal.tenantId, input);
    setSessionPrincipal(request, principalFromUserView(principal, user));
    await callSessionMethod(request, 'save');
    return createOkResponse(user);
  }

  @Get('locales')
  @ApiOkDataResponse(SupportedLocalesPayloadDto)
  locales(): OkResponse<SupportedLocalesPayload> {
    return createOkResponse({ supportedLocales });
  }

  @Post('logout')
  @ApiOkDataResponse(LogoutPayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthenticatedResponse,
    @Body() input?: Partial<RefreshTokenDto>,
  ): Promise<OkResponse<LogoutPayload>> {
    if (hasRefreshTokenInput(input)) {
      await this.auth.revokeRefreshToken(input);
    }
    await clearRequestSession(request, response);
    return createOkResponse({ loggedOut: true });
  }

  private recordExternalLogin(
    request: AuthenticatedRequest,
    session: AuthSessionView,
    provider: string,
    channel: string,
  ): Promise<void> {
    return this.loginAnalytics.record({
      request,
      tenantId: session.user.tenantId,
      userId: session.user.id,
      identifier: session.user.email,
      eventType: 'login',
      outcome: 'success',
      provider,
      channel,
      language: session.user.locale,
    });
  }

  private recordExternalFailure(
    request: AuthenticatedRequest,
    tenantId: string | null | undefined,
    provider: string,
    channel: string,
  ): Promise<void> {
    return this.loginAnalytics.record({
      request,
      tenantId,
      eventType: 'login',
      outcome: 'failure',
      provider,
      channel,
      failureCode: 'provider_authentication_failed',
    });
  }
}

const NoopAuthLoginAnalytics: Pick<AuthLoginAnalyticsService, 'record'> = {
  record: () => Promise.resolve(),
};
