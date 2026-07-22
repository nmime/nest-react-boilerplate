import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiOkDataResponse, ApiExceptions, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  CurrentUser,
  RequirePermissions,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import {
  AdminRbacGuard,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
} from '@app/backend-feature-admin-shared';
import { ProblemPresentationsUseCase } from '../../application';
import type {
  AdminProblemPresentationCatalog,
  AdminProblemPresentationView,
  ResetAdminProblemPresentationResult,
} from '../../domain';
import { executeAdminUseCase, requestContextFromRequest } from './admin-http';
import {
  AdminProblemPresentationCatalogDto,
  AdminProblemPresentationViewDto,
  ResetAdminProblemPresentationDto,
  ResetAdminProblemPresentationResultDto,
  UpdateAdminProblemPresentationDto,
} from './dto';

@ApiExceptions(400, 401, 403, 404, 409, 429, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin/settings/problem-presentations')
export class AdminProblemPresentationsController {
  constructor(private readonly presentations: ProblemPresentationsUseCase) {}

  @Get()
  @ApiOkDataResponse(AdminProblemPresentationCatalogDto)
  @RequirePermissions(AdminSettingsReadPermission)
  async list(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<AdminProblemPresentationCatalog>> {
    return createOkResponse(await executeAdminUseCase(() => this.presentations.list(principal)));
  }

  @Put()
  @ApiOkDataResponse(AdminProblemPresentationViewDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpdateAdminProblemPresentationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AdminProblemPresentationView>> {
    return createOkResponse(
      await executeAdminUseCase(() => this.presentations.update(principal, input, requestContextFromRequest(request))),
    );
  }

  @Put('reset')
  @ApiOkDataResponse(ResetAdminProblemPresentationResultDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async reset(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: ResetAdminProblemPresentationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<ResetAdminProblemPresentationResult>> {
    return createOkResponse(
      await executeAdminUseCase(() => this.presentations.reset(principal, input, requestContextFromRequest(request))),
    );
  }
}
