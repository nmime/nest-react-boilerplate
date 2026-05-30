import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { supportedLocales } from "@app/common/i18n";
import { ApiOkDataResponse, ApiProblemExceptions } from "@app/common/swagger";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  CurrentUser,
  type AuthenticatedPrincipal,
  RbacGuard,
  SessionAuthGuard,
  RequirePermissions,
  RequireRoles,
} from "@app/feature-auth-shared";
import {
  ADMIN_PROFILE_READ_PERMISSION,
  ADMIN_ROLE,
  type AdminProfileView,
  toAdminProfileView,
} from "@app/feature-admin-shared";

export interface AdminProfilePayload {
  principal: AuthenticatedPrincipal;
  profile: AdminProfileView;
}

export class AuthenticatedPrincipalDto {
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

export class AdminProfileViewDto {
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

export const getAuthenticatedPrincipalDtoType = () => AuthenticatedPrincipalDto;
export const getAdminProfileViewDtoType = () => AdminProfileViewDto;

export class AdminProfilePayloadDto {
  @ApiProperty({ type: getAuthenticatedPrincipalDtoType })
  principal!: AuthenticatedPrincipalDto;

  @ApiProperty({ type: getAdminProfileViewDtoType })
  profile!: AdminProfileViewDto;
}

@ApiProblemExceptions(400, 401, 403, 429, 500)
@Controller("admin/profile")
@UseGuards(new SessionAuthGuard(), new RbacGuard())
export class AdminProfileController {
  @Get("me")
  @ApiOkDataResponse(AdminProfilePayloadDto)
  @ApiBearerAuth()
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_PROFILE_READ_PERMISSION)
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<AdminProfilePayload> {
    return createOkResponse({
      principal,
      profile: toAdminProfileView(principal),
    });
  }
}
