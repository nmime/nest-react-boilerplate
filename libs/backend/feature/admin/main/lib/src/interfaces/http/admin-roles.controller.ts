import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  CurrentUser,
  RequirePermissions,
  RequireRoles,
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import {
  AdminRole,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersWritePermission,
} from '@app/backend-feature-admin-shared';
import { AdminRolesUseCase } from '../../application';
import type { AdminRbacCatalog, AdminRoleView, AdminUserView } from '../../domain';
import { AdminRbacGuard } from './admin-rbac.guard';
import { executeAdminUseCase, requestContextFromRequest } from './admin-http';
import {
  AdminRbacCatalogPayloadDto,
  AdminRoleViewDto,
  AdminUserViewDto,
  AssignAdminUserRolesDto,
  CreateAdminRoleDto,
  SetAdminRolePermissionsDto,
  UpdateAdminRoleDto,
} from './dto';

@ApiExceptions(400, 401, 403, 404, 409, 429, 500)
@ApiBearerAuth()
@ApiSessionCookieAuth()
@UseGuards(new SessionAuthGuard(), new AdminRbacGuard())
@Controller('admin')
export class AdminRolesController {
  constructor(private readonly adminRoles: AdminRolesUseCase) {}

  @Get('roles')
  @ApiOkDataResponse(AdminRbacCatalogPayloadDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminRolesReadPermission)
  async listRoles(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<AdminRbacCatalog>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminRoles.listRolesCatalog(principal)));
  }

  @Post('roles')
  @ApiOkDataResponse(AdminRoleViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminRolesWritePermission)
  async createRole(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateAdminRoleDto,
  ): Promise<OkResponse<AdminRoleView>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminRoles.createRole(principal, input)));
  }

  @Patch('roles/:id')
  @ApiOkDataResponse(AdminRoleViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminRolesWritePermission)
  async updateRole(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateAdminRoleDto,
  ): Promise<OkResponse<AdminRoleView>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminRoles.updateRole(principal, id, input)));
  }

  @Put('roles/:id/permissions')
  @ApiOkDataResponse(AdminRoleViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminRolesWritePermission)
  async setRolePermissions(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: SetAdminRolePermissionsDto,
  ): Promise<OkResponse<AdminRoleView>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminRoles.setRolePermissions(principal, id, input)));
  }

  @Put('users/:id/roles')
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminUsersWritePermission, AdminUsersAccessPolicyUpdatePermission)
  async assignUserRoles(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: AssignAdminUserRolesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminRoles.assignUserRoles(principal, id, input, requestContextFromRequest(request)),
      ),
    );
  }
}
