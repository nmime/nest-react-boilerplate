import { Controller, Get, InternalServerErrorException, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { AdminAuthLoginAnalyticsReadPermission, AdminRbacGuard, AdminRole } from '@app/backend-feature-admin-shared';
import {
  CurrentUser,
  RequirePermissions,
  RequireRoles,
  SessionAuthGuard,
  type AuthenticatedPrincipal,
} from '@app/backend-feature-auth-shared';
import {
  AuthLoginAnalyticsListPayloadDto,
  AuthLoginAnalyticsQueryDto,
  AuthLoginAnalyticsSummaryDto,
} from './auth-login-analytics-admin.dto';
import {
  AuthLoginAnalyticsAdminPersistenceError,
  AuthLoginAnalyticsAdminService,
} from './auth-login-analytics-admin.service';

@ApiExceptions(400, 401, 403, 429, 500)
@ApiBearerAuth()
@ApiSessionCookieAuth()
@UseGuards(new SessionAuthGuard(), new AdminRbacGuard())
@RequireRoles(AdminRole)
@RequirePermissions(AdminAuthLoginAnalyticsReadPermission)
@Controller('admin/auth/login-analytics')
export class AuthLoginAnalyticsAdminController {
  constructor(private readonly analytics: AuthLoginAnalyticsAdminService) {}

  @Get()
  @ApiOkDataResponse(AuthLoginAnalyticsListPayloadDto)
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AuthLoginAnalyticsQueryDto,
  ): Promise<OkResponse<AuthLoginAnalyticsListPayloadDto>> {
    return createOkResponse(await this.execute(() => this.analytics.list(principal.tenantId, query)));
  }

  @Get('summary')
  @ApiOkDataResponse(AuthLoginAnalyticsSummaryDto)
  async summary(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AuthLoginAnalyticsQueryDto,
  ): Promise<OkResponse<AuthLoginAnalyticsSummaryDto>> {
    return createOkResponse(await this.execute(() => this.analytics.summary(principal.tenantId, query)));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AuthLoginAnalyticsAdminPersistenceError) {
        throw new InternalServerErrorException();
      }
      throw error;
    }
  }
}
