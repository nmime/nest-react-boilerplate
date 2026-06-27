import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { supportedLocales } from "@app/common/i18n";
import {
  ApiOkDataResponse,
  ApiExceptions,
  ApiSessionCookieAuth,
} from "@app/backend/common/swagger";
import {
  createOkResponse,
  type OkResponse,
} from "@app/backend/common/response";
import {
  clearSessionPrincipal,
  CurrentUser,
  setSessionPrincipal,
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type AuthenticatedResponse,
  type AuthSessionView,
  userThemePreferences,
  Language,
} from "@app/backend/feature/auth/shared";
import { AuthService, toSessionPrincipal } from "./auth.service";
import {
  ExternalAuthService,
  type ExternalAuthLoginResult,
} from "./external-auth.service";

export class RegisterDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: "user@example.com", format: "email" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: "Ada Lovelace" })
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
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: "user@example.com", format: "email" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ExternalAuthIntentDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ enum: ["login", "link"] })
  @IsOptional()
  @IsString()
  @IsIn(["login", "link"])
  intent?: "login" | "link";

  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @IsString()
  linkToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class TelegramWebLoginDto extends ExternalAuthIntentDto {
  @ApiProperty({ type: "object", additionalProperties: true })
  payload!: Record<string, string | number | boolean | null | undefined>;
}

export class TelegramTmaDto extends ExternalAuthIntentDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  initData!: string;
}

export class TelegramBotLinkDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  linkToken!: string;

  @ApiProperty()
  @IsString()
  providerSubject!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class LinkTokenDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ enum: ["telegram", "discord"] })
  @IsString()
  @IsIn(["telegram", "discord"])
  provider!: "telegram" | "discord";

  @ApiPropertyOptional({ enum: ["login", "link"] })
  @IsOptional()
  @IsString()
  @IsIn(["login", "link"])
  intent?: "login" | "link";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class DiscordAuthorizationRequestDto extends ExternalAuthIntentDto {}

export class DiscordCallbackQueryDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  state!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(16)
  refreshToken!: string;
}

export class UserActionTokenRequestDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: "user@example.com", format: "email" })
  @IsEmail()
  email!: string;
}

export interface UserActionTokenPayload {
  issued: boolean;
}

export interface MePayload {
  principal: AuthenticatedPrincipal;
  user: AuthSessionView["user"] | null;
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

export interface SupportedLocalesPayload {
  supportedLocales: typeof supportedLocales;
}

export interface LogoutPayload {
  loggedOut: true;
}

class AuthenticatedPrincipalDto {
  @ApiProperty()
  subject!: string;

  @ApiProperty({ format: "uuid" })
  tenantId!: string;

  @ApiPropertyOptional({ format: "email" })
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
    oneOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }],
  })
  audience?: string | string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  roles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];

  @ApiPropertyOptional()
  tokenId?: string;
}

class AuthenticatedUserViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: "uuid" })
  tenantId!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiProperty({ enum: userThemePreferences })
  theme!: string;

  @ApiProperty({ items: { type: "string" }, type: "array" })
  roles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];
}

class AuthSessionViewDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ enum: ["Bearer"] })
  tokenType!: "Bearer";

  @ApiProperty()
  expiresIn!: number;

  @ApiPropertyOptional({ writeOnly: true })
  refreshToken?: string;

  @ApiProperty({ type: () => AuthenticatedUserViewDto })
  user!: AuthenticatedUserViewDto;

  @ApiPropertyOptional({ items: { type: "string" }, type: "array" })
  amr?: string[];

  @ApiPropertyOptional({ enum: ["password", "telegram", "discord"] })
  authProvider?: string;

  @ApiPropertyOptional({
    enum: [
      "password",
      "telegram_web_login",
      "telegram_tma",
      "telegram_bot",
      "discord_oauth",
      "discord_bot",
    ],
  })
  authChannel?: string;

  @ApiPropertyOptional()
  authTime?: number;

  @ApiPropertyOptional({ format: "uuid" })
  externalIdentityId?: string;
}

class ExternalAuthResultDto {
  @ApiProperty({ enum: ["authenticated", "linked", "needs_link", "conflict"] })
  status!: string;

  @ApiPropertyOptional()
  code?: string;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional({ type: () => AuthSessionViewDto })
  session?: AuthSessionViewDto;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  identity?: unknown;

  @ApiPropertyOptional()
  returnUrl?: string;
}

class LinkTokenResultDto {
  @ApiProperty({ writeOnly: true })
  token!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({ enum: ["telegram", "discord"] })
  provider!: string;

  @ApiProperty({ enum: ["login", "link"] })
  intent!: string;
}

class UserActionTokenPayloadDto {
  @ApiProperty()
  issued!: boolean;
}

class MePayloadDto {
  @ApiProperty({ type: () => AuthenticatedPrincipalDto })
  principal!: AuthenticatedPrincipalDto;

  @ApiProperty({ nullable: true, type: () => AuthenticatedUserViewDto })
  user!: AuthenticatedUserViewDto | null;
}

class SupportedLocalesPayloadDto {
  @ApiProperty({ enum: supportedLocales, isArray: true })
  supportedLocales!: typeof supportedLocales;
}

class LogoutPayloadDto {
  @ApiProperty({ enum: [true] })
  loggedOut!: true;
}

type SessionMethod = "destroy" | "regenerate" | "save";
export const SESSION_COOKIE_NAME = "SESSION_COOKIE_NAME";

function getSessionCookieName(): string {
  const configured = process.env[SESSION_COOKIE_NAME]?.trim();
  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "__Host-nrb.sid" : "nrb.sid";
}

async function callSessionMethod(
  request: AuthenticatedRequest,
  method: SessionMethod,
): Promise<void> {
  const handler = request.session?.[method];
  if (typeof handler !== "function") {
    return;
  }

  if (handler.length > 0) {
    await new Promise<void>((resolve, reject) => {
      (handler as (callback: (error?: unknown) => void) => void).call(
        request.session,
        (error?: unknown) => {
          if (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("Session lifecycle method failed."),
            );
            return;
          }
          resolve();
        },
      );
    });
    return;
  }

  const result = (handler as () => Promise<void> | void).call(request.session);
  if (result) {
    await result;
  }
}

async function establishRequestSession(
  request: AuthenticatedRequest,
  session: AuthSessionView,
): Promise<void> {
  await callSessionMethod(request, "regenerate");
  setSessionPrincipal(request, toSessionPrincipal(session));
  await callSessionMethod(request, "save");
}

async function establishExternalSessionIfPresent(
  request: AuthenticatedRequest,
  result: { session?: AuthSessionView },
): Promise<void> {
  if (result.session) {
    await establishRequestSession(request, result.session);
  }
}

function clearSessionCookie(
  request: AuthenticatedRequest,
  response?: AuthenticatedResponse,
): void {
  const cookieName = getSessionCookieName();
  const options = { path: "/" };
  request.res?.clearCookie?.(cookieName, options);
  request.reply?.clearCookie?.(cookieName, options);
  request.raw?.res?.clearCookie?.(cookieName, options);
  response?.clearCookie?.(cookieName, options);
}

async function clearRequestSession(
  request: AuthenticatedRequest,
  response?: AuthenticatedResponse,
): Promise<void> {
  clearSessionPrincipal(request);
  await callSessionMethod(request, "destroy");
  clearSessionCookie(request, response);
}

function principalFromUserView(
  principal: AuthenticatedPrincipal,
  user: AuthSessionView["user"],
): AuthenticatedPrincipal {
  return {
    ...principal,
    subject: user.id,
    tenantId: user.tenantId,
    email: user.email ?? undefined,
    displayName: user.displayName,
    locale: user.locale as Language,
    theme: user.theme,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@ApiExceptions(400, 401, 403, 409, 429, 500)
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly externalAuth: ExternalAuthService,
  ) {}

  @Post("register")
  @ApiOkDataResponse(AuthSessionViewDto)
  async register(
    @Body() input: RegisterDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView>> {
    const session = await this.auth.register(input);
    await establishRequestSession(request, session);
    return createOkResponse(session);
  }

  @Post("login")
  @ApiOkDataResponse(AuthSessionViewDto)
  async login(
    @Body() input: LoginDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView>> {
    const session = await this.auth.login(input);
    await establishRequestSession(request, session);
    return createOkResponse(session);
  }

  @Post("refresh")
  @ApiOkDataResponse(AuthSessionViewDto)
  async refresh(
    @Body() input: RefreshTokenDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView>> {
    const session = await this.auth.refreshSession(input);
    await establishRequestSession(request, session);
    return createOkResponse(session);
  }

  @Post("telegram/web-login")
  @ApiOkDataResponse(ExternalAuthResultDto)
  async telegramWebLogin(
    @Body() input: TelegramWebLoginDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<ExternalAuthLoginResult>> {
    const result = await this.externalAuth.telegramWebLogin({
      ...input,
      principal: request.user ?? request.auth ?? null,
    });
    await establishExternalSessionIfPresent(request, result);
    return createOkResponse(result);
  }

  @Post("telegram/tma")
  @ApiOkDataResponse(ExternalAuthResultDto)
  async telegramTma(
    @Body() input: TelegramTmaDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<ExternalAuthLoginResult>> {
    const result = await this.externalAuth.telegramTma({
      ...input,
      principal: request.user ?? request.auth ?? null,
    });
    await establishExternalSessionIfPresent(request, result);
    return createOkResponse(result);
  }

  @Post("telegram/bot-link")
  @ApiOkDataResponse(ExternalAuthResultDto)
  async telegramBotLink(
    @Body() input: TelegramBotLinkDto,
  ): Promise<OkResponse<ExternalAuthLoginResult>> {
    return createOkResponse(await this.externalAuth.telegramBotLink(input));
  }

  @Post("discord/authorization-request")
  @ApiOkDataResponse(Object)
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

  @Get("discord/callback")
  @Redirect(undefined, 302)
  async discordCallback(
    @Query() input: DiscordCallbackQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<ExternalAuthLoginResult> | { url: string }> {
    const result = await this.externalAuth.discordCallback({
      ...input,
      principal: request.user ?? request.auth ?? null,
    });
    await establishExternalSessionIfPresent(request, result);
    return result.returnUrl
      ? { url: result.returnUrl }
      : createOkResponse(result);
  }

  @Get("provider-identities")
  @ApiOkDataResponse(Object)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async providerIdentities(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(
      await this.externalAuth.listProviderIdentities(
        principal.subject,
        principal.tenantId,
      ),
    );
  }

  @Delete("provider-identities/:identityId")
  @ApiOkDataResponse(Object)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async unlinkProviderIdentity(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("identityId") identityId: string,
  ): Promise<OkResponse<{ unlinked: boolean }>> {
    return createOkResponse(
      await this.externalAuth.unlinkProviderIdentity(identityId, principal),
    );
  }

  @Post("link-tokens")
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
        tenantId: input.tenantId ?? principal.tenantId,
      }),
    );
  }

  @Post("email-verification-token")
  @ApiOkDataResponse(UserActionTokenPayloadDto)
  async requestEmailVerification(
    @Body() input: UserActionTokenRequestDto,
  ): Promise<OkResponse<UserActionTokenPayload>> {
    await this.auth.issueEmailVerificationToken(input);
    return createOkResponse({ issued: true });
  }

  @Post("password-reset-token")
  @ApiOkDataResponse(UserActionTokenPayloadDto)
  async requestPasswordReset(
    @Body() input: UserActionTokenRequestDto,
  ): Promise<OkResponse<UserActionTokenPayload>> {
    await this.auth.issuePasswordResetToken(input);
    return createOkResponse({ issued: true });
  }

  @Get("me")
  @ApiOkDataResponse(MePayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<MePayload>> {
    return createOkResponse({
      principal,
      user: await this.auth.getUserById(principal.subject, principal.tenantId),
    });
  }

  @Patch("me/locale")
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async updateLocale(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdateLocaleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    const user = await this.auth.updateUserPreferences(
      principal.subject,
      principal.tenantId,
      { locale: input.locale },
    );
    setSessionPrincipal(request, principalFromUserView(principal, user));
    await callSessionMethod(request, "save");
    return createOkResponse(user);
  }

  @Patch("me/preferences")
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async updatePreferences(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdatePreferencesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    const user = await this.auth.updateUserPreferences(
      principal.subject,
      principal.tenantId,
      input,
    );
    setSessionPrincipal(request, principalFromUserView(principal, user));
    await callSessionMethod(request, "save");
    return createOkResponse(user);
  }

  @Get("locales")
  @ApiOkDataResponse(SupportedLocalesPayloadDto)
  locales(): OkResponse<SupportedLocalesPayload> {
    return createOkResponse({ supportedLocales });
  }

  @Post("logout")
  @ApiOkDataResponse(LogoutPayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @UseGuards(new SessionAuthGuard())
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthenticatedResponse,
    @Body() input?: Partial<RefreshTokenDto>,
  ): Promise<OkResponse<LogoutPayload>> {
    if (input?.refreshToken) {
      await this.auth.revokeRefreshToken(input as RefreshTokenDto);
    }
    await clearRequestSession(request, response);
    return createOkResponse({ loggedOut: true });
  }
}
