import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { ApiParam } from '@nestjs/swagger';
import {
  CurrentUser,
  RequirePermissions,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import {
  AdminFeatureFlagsReadPermission,
  AdminFeatureFlagsWritePermission,
  AdminRbacGuard,
} from '@app/backend-feature-admin-shared';
import { AdminFeatureFlagsUseCase, type AdminFeatureFlagView } from '../../application';
import { executeAdminUseCase, requestContextFromRequest } from './admin-http';
import { AdminFeatureFlagListPayloadDto, AdminFeatureFlagViewDto, UpsertAdminFeatureFlagDto } from './dto';

@ApiExceptions(400, 401, 403, 404, 409, 429, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin/feature-flags')
export class AdminFeatureFlagsController {
  constructor(private readonly featureFlags: AdminFeatureFlagsUseCase) {}

  @Get()
  @ApiOkDataResponse(AdminFeatureFlagListPayloadDto)
  @RequirePermissions(AdminFeatureFlagsReadPermission)
  async list(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<{ items: AdminFeatureFlagView[] }>> {
    return createOkResponse(await executeAdminUseCase(() => this.featureFlags.list(principal)));
  }

  @Put(':key')
  @ApiParam({
    name: 'key',
    schema: { pattern: '^[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9]*)*$', type: 'string' },
  })
  @ApiOkDataResponse(AdminFeatureFlagViewDto)
  @RequirePermissions(AdminFeatureFlagsWritePermission)
  async upsert(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('key') key: string,
    @Body() input: UpsertAdminFeatureFlagDto,
    @Req() request: AuthenticatedRequest = {},
  ): Promise<OkResponse<AdminFeatureFlagView>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.featureFlags.upsert(principal, key, input, requestContextFromRequest(request)),
      ),
    );
  }
}
