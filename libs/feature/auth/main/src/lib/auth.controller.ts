import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { supportedLocales } from "@app/common/i18n";
import { ApiOkDataResponse, ApiProblemExceptions } from "@app/common/swagger";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  CurrentUser,
  type AuthenticatedPrincipal,
} from "@app/feature-auth-oauth";
import {
  type AuthSessionView,
  userThemePreferences,
} from "@app/feature-auth-shared";
import { AuthService } from "./auth.service";

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

@ApiProblemExceptions(400, 401, 403, 409, 429, 500)
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  @ApiOkDataResponse(AuthSessionViewDto)
  async register(
    @Body() input: RegisterDto,
  ): Promise<OkResponse<AuthSessionView>> {
    return createOkResponse(await this.auth.register(input));
  }

  @Post("login")
  @ApiOkDataResponse(AuthSessionViewDto)
  async login(@Body() input: LoginDto): Promise<OkResponse<AuthSessionView>> {
    return createOkResponse(await this.auth.login(input));
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOkDataResponse(MePayloadDto)
  @UseGuards(new BearerAuthGuard())
  async me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<MePayload>> {
    return createOkResponse({
      principal,
      user: await this.auth.getUserById(principal.subject),
    });
  }

  @Patch("me/locale")
  @ApiBearerAuth()
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @UseGuards(new BearerAuthGuard())
  async updateLocale(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdateLocaleDto,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    return createOkResponse(
      await this.auth.updateUserPreferences(principal.subject, {
        locale: input.locale,
      }),
    );
  }

  @Patch("me/preferences")
  @ApiBearerAuth()
  @ApiOkDataResponse(AuthenticatedUserViewDto)
  @UseGuards(new BearerAuthGuard())
  async updatePreferences(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdatePreferencesDto,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    return createOkResponse(
      await this.auth.updateUserPreferences(principal.subject, input),
    );
  }

  @Get("locales")
  @ApiOkDataResponse(SupportedLocalesPayloadDto)
  locales(): OkResponse<SupportedLocalesPayload> {
    return createOkResponse({ supportedLocales });
  }

  @Post("logout")
  @ApiBearerAuth()
  @ApiOkDataResponse(LogoutPayloadDto)
  @UseGuards(new BearerAuthGuard())
  logout(): OkResponse<LogoutPayload> {
    return createOkResponse({ loggedOut: true });
  }
}
