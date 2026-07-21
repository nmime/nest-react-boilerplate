import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  CurrentUser,
  RequirePermissions,
  RequireRoles,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import {
  AdminDashboardReadPermission,
  AdminRbacGuard,
  AdminRole,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersWritePermission,
} from '@app/backend-feature-admin-shared';
import { AdminUsersUseCase } from '../../application';
import type { AdminDashboardSummary, AdminUserListPayload, AdminUserView } from '../../domain';
import { executeAdminUseCase, requestContextFromRequest } from './admin-http';
import {
  AdminDashboardSummaryDto,
  AdminUserListPayloadDto,
  AdminUserQueryDto,
  AdminUserViewDto,
  UpdateAdminUserAccessPolicyDto,
  UpdateAdminUserStatusDto,
} from './dto';

@ApiExceptions(400, 401, 403, 404, 429, 500)
@ApiBearerAuth()
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersUseCase) {}

  @Get('users')
  @ApiOkDataResponse(AdminUserListPayloadDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminUsersReadPermission)
  async listUsers(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AdminUserQueryDto,
  ): Promise<OkResponse<AdminUserListPayload>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminUsers.listUsers(principal, query)));
  }

  @Get('users/:id')
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminUsersReadPermission)
  async getUser(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminUsers.getUser(principal, id)));
  }

  @Patch('users/:id/status')
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminUsersWritePermission, AdminUsersStatusUpdatePermission)
  async updateUserStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateAdminUserStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.updateUserStatus(principal, id, input, requestContextFromRequest(request)),
      ),
    );
  }

  @Patch('users/:id/access-policy')
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminUsersWritePermission, AdminUsersAccessPolicyUpdatePermission)
  async updateUserAccessPolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateAdminUserAccessPolicyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.updateUserAccessPolicy(principal, id, input, requestContextFromRequest(request)),
      ),
    );
  }

  @Get('dashboard/summary')
  @ApiOkDataResponse(AdminDashboardSummaryDto)
  @RequireRoles(AdminRole)
  @RequirePermissions(AdminDashboardReadPermission)
  async dashboardSummary(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<AdminDashboardSummary>> {
    return createOkResponse(await executeAdminUseCase(() => this.adminUsers.dashboardSummary(principal)));
  }
}
