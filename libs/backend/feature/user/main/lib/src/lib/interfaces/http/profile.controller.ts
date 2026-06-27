import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
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
  CurrentUser,
  type AuthenticatedPrincipal,
  RbacGuard,
  SessionAuthGuard,
  RequirePermissions,
} from "@app/backend/feature/auth/shared";
import {
  GetCurrentUserProfileUseCase,
  toUserProfilePayload,
  USER_PROFILE_READ_PERMISSION,
  type UserProfilePayload,
} from "@app/backend/feature/user/shared";
import { ProfilePayloadDto } from "./profile.dto";

export type ProfilePayload = UserProfilePayload;

@ApiExceptions(400, 401, 403, 429, 500)
@Controller("profile")
@UseGuards(new SessionAuthGuard(), new RbacGuard())
export class ProfileController {
  constructor(
    private readonly getCurrentUserProfile: GetCurrentUserProfileUseCase,
  ) {}

  @Get("me")
  @ApiOkDataResponse(ProfilePayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @RequirePermissions(USER_PROFILE_READ_PERMISSION)
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<ProfilePayload> {
    return createOkResponse(
      toUserProfilePayload(principal, this.getCurrentUserProfile),
    );
  }
}
