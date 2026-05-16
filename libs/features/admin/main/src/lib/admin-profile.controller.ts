import { Controller, Get, UseGuards } from "@nestjs/common";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  BearerAuthGuard,
  CurrentUser,
  type AuthenticatedPrincipal,
  RbacGuard,
  RequirePermissions,
  RequireRoles,
} from "@app/features-auth-oauth";
import {
  ADMIN_LEGACY_READ_PERMISSION,
  ADMIN_ROLE,
  type AdminProfileView,
  toAdminProfileView,
} from "@app/features-admin-shared";

export interface AdminProfilePayload {
  principal: AuthenticatedPrincipal;
  profile: AdminProfileView;
}

@Controller("admin/profile")
@UseGuards(new BearerAuthGuard(), new RbacGuard())
export class AdminProfileController {
  @Get("me")
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_LEGACY_READ_PERMISSION)
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<AdminProfilePayload> {
    return createOkResponse({
      principal,
      profile: toAdminProfileView(principal),
    });
  }
}
