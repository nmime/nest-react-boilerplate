import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { supportedLocales } from "@app/common/i18n";
import { ApiOkDataResponse, ApiProblemExceptions } from "@app/common/swagger";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  CurrentUser,
  type AuthenticatedPrincipal,
  RbacGuard,
  SessionAuthGuard,
  RequirePermissions,
} from "@app/feature-auth-oauth";

export interface ProfilePayload {
  principal: AuthenticatedPrincipal;
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

class ProfilePayloadDto {
  @ApiProperty({ type: () => AuthenticatedPrincipalDto })
  principal!: AuthenticatedPrincipalDto;
}

@ApiProblemExceptions(400, 401, 403, 429, 500)
@Controller("profile")
@UseGuards(new SessionAuthGuard(), new RbacGuard())
export class ProfileController {
  @Get("me")
  @ApiOkDataResponse(ProfilePayloadDto)
  @RequirePermissions("profile:read")
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<ProfilePayload> {
    return createOkResponse({ principal });
  }
}
