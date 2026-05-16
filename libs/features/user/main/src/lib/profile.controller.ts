import { Controller, Get, UseGuards } from "@nestjs/common";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  CurrentUser,
  type AuthenticatedPrincipal,
  RbacGuard,
  RequirePermissions,
} from "@app/features-auth-oauth";
import {
  toUserProfileView,
  USER_PROFILE_READ_PERMISSION,
  type UserProfileView,
} from "@app/features-user-shared";

export interface ProfilePayload {
  principal: AuthenticatedPrincipal;
  profile: UserProfileView;
}

@Controller("profile")
@UseGuards(new BearerAuthGuard(), new RbacGuard())
export class ProfileController {
  @Get("me")
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
