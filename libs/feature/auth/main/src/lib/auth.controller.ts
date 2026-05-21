import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { supportedLocales } from "@app/common/i18n";
import { ApiOkDataResponse, ApiProblemExceptions } from "@app/common/swagger";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  clearSessionPrincipal,
  CurrentUser,
  SessionAuthGuard,
  setSessionPrincipal,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from "@app/feature-auth-oauth";
import {
  type AuthSessionView,
  userThemePreferences,
} from "@app/feature-auth-shared";
import { AuthService, toSessionPrincipal } from "./auth.service";

export class RegisterDto {
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

function getSessionCookieName(): string {
  const configured = process.env.SESSION_COOKIE_NAME?.trim();
  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "__Host-nrb.sid" : "nrb.sid";
}

function callSessionMethod(
  request: AuthenticatedRequest,
  method: SessionMethod,
): Promise<void> {
  const handler = request.session?.[method];
  if (typeof handler !== "function") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    handler.call(request.session, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function establishRequestSession(
  request: AuthenticatedRequest,
  session: AuthSessionView,
): Promise<void> {
  await callSessionMethod(request, "regenerate");
  setSessionPrincipal(request, toSessionPrincipal(session));
  await callSessionMethod(request, "save");
}

async function clearRequestSession(
  request: AuthenticatedRequest,
): Promise<void> {
  clearSessionPrincipal(request);
  await callSessionMethod(request, "destroy");
  request.res?.clearCookie?.(getSessionCookieName(), { path: "/" });
}

function principalFromUserView(
  principal: AuthenticatedPrincipal,
  user: AuthSessionView["user"],
): AuthenticatedPrincipal {
  return {
    ...principal,
    subject: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: user.locale,
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
  @UseGuards(new SessionAuthGuard())
  async me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<MePayload>> {
    return createOkResponse({
      principal,
      user: await this.auth.getUserById(principal.subject),
    });
  }

  @Patch("me/locale")
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @UseGuards(new SessionAuthGuard())
  async updateLocale(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdateLocaleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    const user = await this.auth.updateUserPreferences(principal.subject, {
      locale: input.locale,
    });
    setSessionPrincipal(request, principalFromUserView(principal, user));
    await callSessionMethod(request, "save");
    return createOkResponse(user);
  }

  @Patch("me/preferences")
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @UseGuards(new SessionAuthGuard())
  async updatePreferences(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdatePreferencesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    const user = await this.auth.updateUserPreferences(principal.subject, input);
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
  @UseGuards(new SessionAuthGuard())
  async logout(
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<LogoutPayload>> {
    await clearRequestSession(request);
    return createOkResponse({ loggedOut: true });
  }
}
