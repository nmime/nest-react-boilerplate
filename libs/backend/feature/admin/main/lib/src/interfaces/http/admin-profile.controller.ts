import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import {
  ApiOkDataResponse,
  ApiExceptions,
  ApiSessionCookieAuth,
} from "@app/backend-common-swagger";
import {
  createOkResponse,
  type OkResponse,
} from "@app/backend-common-response";
import {
  CurrentUser,
  type AuthenticatedPrincipal,
  SessionAuthGuard,
  RequirePermissions,
  RequireRoles,
} from "@app/backend-feature-auth-shared";
import {
  AdminProfileReadPermission,
  AdminRole,
} from "@app/backend-feature-admin-shared";
import {
  GetAdminProfileUseCase,
  type AdminProfilePayload,
} from "../../application";
import { AdminRbacGuard } from "./admin-rbac.guard";
import {
  AdminProfilePayloadDto,
  AdminProfileViewDto,
  AuthenticatedPrincipalDto,
} from "./dto";

export const getAuthenticatedPrincipalDtoType = () => AuthenticatedPrincipalDto;
export const getAdminProfileViewDtoType = () => AdminProfileViewDto;

@ApiExceptions(400, 401, 403, 429, 500)
@Controller("admin/profile")
@UseGuards(new SessionAuthGuard(), new AdminRbacGuard())
export class AdminProfileController {
  constructor(private readonly getProfile: GetAdminProfileUseCase) {}

  @Get("me")
  @ApiOkDataResponse(AdminProfilePayloadDto)
  @ApiBearerAuth()
  @ApiSessionCookieAuth()
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminProfileReadPermission)
  me(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): OkResponse<AdminProfilePayload> {
    return createOkResponse(this.getProfile.execute(principal));
  }
}
