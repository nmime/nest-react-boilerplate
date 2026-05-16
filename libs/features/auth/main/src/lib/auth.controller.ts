import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  CurrentUser,
  type AuthenticatedPrincipal,
} from "@app/features-auth-oauth";
import type { AuthSessionView } from "@app/features-auth-shared";
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
  me(@CurrentUser() principal: AuthenticatedPrincipal): OkResponse<MePayload> {
    return createOkResponse({ principal });
  }

  @Post("logout")
  @UseGuards(new BearerAuthGuard())
  logout(): OkResponse<LogoutPayload> {
    return createOkResponse({ loggedOut: true });
  }
}
