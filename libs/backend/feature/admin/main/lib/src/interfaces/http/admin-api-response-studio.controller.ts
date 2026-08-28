import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
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
import { ApiResponseStudioService } from '../../application';
import { resolveTenantId } from '../../application/util';
import { requestContextFromRequest } from './admin-http';
import {
  ApiResponseStudioDashboardDto,
  ApiResponseStudioExportDto,
  ApiResponseStudioHistoryListDto,
  ApiResponseStudioHistoryQueryDto,
  ApiResponseStudioResponseListDto,
  ApiResponseStudioResponseQueryDto,
  ApiResponseStudioResponseViewDto,
  ApiResponseStudioSourceListDto,
  ApiResponseStudioSourceViewDto,
  ApiResponseStudioSyncResultDto,
  BulkApiResponseStudioResponsesDto,
  CreateApiResponseStudioSourceDto,
  DismissApiResponseStudioResponsesDto,
  ResetApiResponseStudioResponseDto,
  SyncApiResponseStudioSourceDto,
  UpdateApiResponseStudioResponseDto,
  UpdateApiResponseStudioSourceDto,
} from './dto';

const unwrap = <T>(result: { isErr(): boolean; error?: { code: string; message: string }; value?: T }): T => {
  if (!result.isErr()) {return result.value as T;}
  const error = result.error;
  if (error?.code === 'revision_conflict') {throw new ConflictException(error.message);}
  if (error?.code === 'not_found') {throw new NotFoundException(error.message);}
  if (error?.code === 'validation_error') {throw new BadRequestException(error.message);}
  throw new InternalServerErrorException(error?.message ?? 'API Response Studio operation failed.');
};

@ApiExceptions(400, 401, 403, 404, 409, 429, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@Controller('admin/settings/api-response-studio')
export class AdminApiResponseStudioController {
  constructor(private readonly studio: ApiResponseStudioService) {}
  @Get('dashboard')
  @ApiOkDataResponse(ApiResponseStudioDashboardDto)
  @RequirePermissions(AdminSettingsReadPermission)
  async dashboard(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<unknown>> {
    return createOkResponse(unwrap(await this.studio.dashboard(resolveTenantId(principal))));
  }
  @Get('sources')
  @ApiOkDataResponse(ApiResponseStudioSourceListDto)
  @RequirePermissions(AdminSettingsReadPermission)
  async sources(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<unknown>> {
    return createOkResponse({ items: unwrap(await this.studio.listSources(resolveTenantId(principal))) });
  }
  @Post('sources')
  @ApiOkDataResponse(ApiResponseStudioSourceViewDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async createSource(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateApiResponseStudioSourceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(
      unwrap(
        await this.studio.createSource({
          ...input,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          manualOnly: true,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    );
  }
  @Put('sources/:id')
  @ApiOkDataResponse(ApiResponseStudioSourceViewDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async updateSource(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateApiResponseStudioSourceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(
      unwrap(
        await this.studio.updateSource({
          ...input,
          id,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    );
  }
  @Post('sources/:id/sync')
  @ApiOkDataResponse(ApiResponseStudioSyncResultDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async sync(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') sourceId: string,
    @Body() input: SyncApiResponseStudioSourceDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(
      unwrap(
        await this.studio.sync({
          ...input,
          sourceId,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    );
  }
  @Get('responses')
  @ApiOkDataResponse(ApiResponseStudioResponseListDto)
  @RequirePermissions(AdminSettingsReadPermission)
  async responses(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ApiResponseStudioResponseQueryDto,
  ): Promise<OkResponse<unknown>> {
    const tenantId = resolveTenantId(principal);
    const [items, total] = await Promise.all([
      this.studio.listResponses(tenantId, query),
      this.studio.countResponses(tenantId, query),
    ]);
    return createOkResponse({ items: unwrap(items), total: unwrap(total) });
  }
  @Put('responses/:id')
  @ApiOkDataResponse(ApiResponseStudioResponseViewDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async updateResponse(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateApiResponseStudioResponseDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    const { expectedRevision, ...presentation } = input;
    return createOkResponse(
      unwrap(
        await this.studio.updateResponse({
          id,
          expectedRevision,
          presentation,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    );
  }
  @Put('responses/:id/reset')
  @ApiOkDataResponse(ApiResponseStudioResponseViewDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async resetResponse(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: ResetApiResponseStudioResponseDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(
      unwrap(
        await this.studio.resetResponse({
          ...input,
          id,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    );
  }
  @Patch('responses/bulk')
  @ApiOkDataResponse(ApiResponseStudioResponseListDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async bulk(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: BulkApiResponseStudioResponsesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse({
      items: unwrap(
        await this.studio.bulkUpdate({
          ...input,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    });
  }
  @Patch('responses/dismiss')
  @ApiOkDataResponse(ApiResponseStudioResponseListDto)
  @RequirePermissions(AdminSettingsUpdatePermission)
  async dismiss(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: DismissApiResponseStudioResponsesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse({
      items: unwrap(
        await this.studio.dismissChanges({
          ...input,
          tenantId: resolveTenantId(principal),
          actorUserId: principal.subject,
          metadata: { ...requestContextFromRequest(request) },
        }),
      ),
    });
  }
  @Get('export')
  @ApiOkDataResponse(ApiResponseStudioExportDto)
  @RequirePermissions(AdminSettingsReadPermission)
  async export(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ApiResponseStudioResponseQueryDto,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse(unwrap(await this.studio.export(resolveTenantId(principal), query)));
  }
  @Get('history')
  @ApiOkDataResponse(ApiResponseStudioHistoryListDto)
  @RequirePermissions(AdminSettingsReadPermission)
  async history(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: ApiResponseStudioHistoryQueryDto,
  ): Promise<OkResponse<unknown>> {
    return createOkResponse({ items: unwrap(await this.studio.history(resolveTenantId(principal), query)) });
  }
}
