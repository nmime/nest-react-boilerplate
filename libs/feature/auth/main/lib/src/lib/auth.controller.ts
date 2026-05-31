import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
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
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { supportedLocales } from "@app/common/i18n";
import { ApiOkDataResponse, ApiProblemExceptions } from "@app/common/swagger";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  clearSessionPrincipal,
  CurrentUser,
  setSessionPrincipal,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type AuthenticatedResponse,
  type AuthSessionView,
  userThemePreferences,
  Language,
} from "@app/feature-auth-shared";
import { AuthService, toSessionPrincipal } from "./auth.service";

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

export interface MePayload {
  principal: AuthenticatedPrincipal;
  user: AuthSessionView["user"] | null;
}

export class UpdateLocaleDto {
  @ApiProperty({ enum: supportedLocales })
  @IsString()
  locale!: string;
}

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: supportedLocales })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ enum: userThemePreferences })
  @IsOptional()
  @IsString()
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

  @ApiProperty({ type: () => AuthenticatedUserViewDto })
  user!: AuthenticatedUserViewDto;
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
    email: user.email,
    displayName: user.displayName,
    locale: user.locale as Language,
    theme: user.theme,
    roles: user.roles,
    permissions: user.permissions,
  };
}

@ApiProblemExceptions(400, 401, 403, 409, 429, 500)
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Get("me")
  @ApiOkDataResponse(MePayloadDto)
  @ApiBearerAuth()
  @UseGuards(new BearerAuthGuard())
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
  @UseGuards(new BearerAuthGuard())
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
  @UseGuards(new BearerAuthGuard())
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
  @UseGuards(new BearerAuthGuard())
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: AuthenticatedResponse,
  ): Promise<OkResponse<LogoutPayload>> {
    await clearRequestSession(request, response);
    return createOkResponse({ loggedOut: true });
  }
}
