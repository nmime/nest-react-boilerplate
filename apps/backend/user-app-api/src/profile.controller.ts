import { Controller, Get, UseGuards } from "@nestjs/common";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  CurrentUser,
  type AuthenticatedPrincipal,
  RbacGuard,
  RequirePermissions,
} from "@app/feature-auth-oauth";

export interface ProfilePayload {
  principal: AuthenticatedPrincipal;
}

@Controller("profile")
@UseGuards(new BearerAuthGuard(), new RbacGuard())
export class ProfileController {
  @Get("me")
  @RequirePermissions("profile:read")
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<ProfilePayload> {
    return createOkResponse({ principal });
  }
}
