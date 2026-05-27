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
} from "@app/feature-auth-shared";
import {
  toUserProfileView,
  USER_PROFILE_READ_PERMISSION,
  type UserProfileView,
} from "@app/feature-user-shared";

export interface ProfilePayload {
  principal: AuthenticatedPrincipal;
  profile: UserProfileView;
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

class UserProfileViewDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ format: "email" })
  email?: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiPropertyOptional({ enum: supportedLocales })
  locale?: string;

  @ApiProperty({ items: { type: "string" }, type: "array" })
  roles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];
}

class ProfilePayloadDto {
  @ApiProperty({ type: () => AuthenticatedPrincipalDto })
  principal!: AuthenticatedPrincipalDto;

  @ApiProperty({ type: () => UserProfileViewDto })
  profile!: UserProfileViewDto;
}

@ApiProblemExceptions(400, 401, 403, 429, 500)
@Controller("profile")
@UseGuards(new SessionAuthGuard(), new RbacGuard())
export class ProfileController {
  @Get("me")
  @ApiOkDataResponse(ProfilePayloadDto)
  @RequirePermissions(USER_PROFILE_READ_PERMISSION)
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<ProfilePayload> {
    return createOkResponse({
      principal,
      profile: toUserProfileView(principal),
    });
  }
}
