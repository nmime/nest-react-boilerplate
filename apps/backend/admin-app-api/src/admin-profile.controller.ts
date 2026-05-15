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

export interface AdminProfilePayload {
  principal: AuthenticatedPrincipal;
}

@Controller("admin/profile")
@UseGuards(new BearerAuthGuard(), new RbacGuard())
export class AdminProfileController {
  @Get("me")
  @RequireRoles("admin")
  @RequirePermissions("admin:read")
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<AdminProfilePayload> {
    return createOkResponse({ principal });
  }
}
