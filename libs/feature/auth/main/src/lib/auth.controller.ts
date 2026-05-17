import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { supportedLocales } from "@app/common/i18n";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  CurrentUser,
  type AuthenticatedPrincipal,
} from "@app/feature-auth-oauth";
import type { AuthSessionView } from "@app/feature-auth-shared";
import { AuthService } from "./auth.service";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export interface MePayload {
  principal: AuthenticatedPrincipal;
  user: AuthSessionView["user"] | null;
}

export class UpdateLocaleDto {
  @IsString()
  locale!: string;
}

export interface SupportedLocalesPayload {
  supportedLocales: typeof supportedLocales;
}

export interface LogoutPayload {
  loggedOut: true;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body() input: RegisterDto,
  ): Promise<OkResponse<AuthSessionView>> {
    return createOkResponse(await this.auth.register(input));
  }

  @Post("login")
  async login(@Body() input: LoginDto): Promise<OkResponse<AuthSessionView>> {
    return createOkResponse(await this.auth.login(input));
  }

  @Get("me")
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
  @UseGuards(new BearerAuthGuard())
  async updateLocale(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdateLocaleDto,
  ): Promise<OkResponse<AuthSessionView["user"]>> {
    return createOkResponse(
      await this.auth.updateUserLocale(principal.subject, input.locale),
    );
  }

  @Get("locales")
  locales(): OkResponse<SupportedLocalesPayload> {
    return createOkResponse({ supportedLocales });
  }

  @Post("logout")
  @UseGuards(new BearerAuthGuard())
  logout(): OkResponse<LogoutPayload> {
    return createOkResponse({ loggedOut: true });
  }
}
