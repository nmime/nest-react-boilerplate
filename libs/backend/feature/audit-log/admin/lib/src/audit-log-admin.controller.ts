import {
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { AdminAuditReadPermission, AdminRbacGuard } from '@app/backend-feature-admin-shared';
import { CurrentUser, RequirePermissions, type AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  AuditLogAdminIdParamDto,
  AuditLogAdminListPayloadDto,
  AuditLogAdminListQueryDto,
  AuditLogAdminMetadataDto,
  AuditLogAdminViewDto,
} from './audit-log-admin.dto';
import { AuditLogAdminPersistenceError, AuditLogAdminService } from './audit-log-admin.service';

@ApiExceptions(400, 401, 403, 404, 429, 500)
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@RequirePermissions(AdminAuditReadPermission)
@Controller('admin/audit')
export class AuditLogAdminController {
  constructor(private readonly audit: AuditLogAdminService) {}

  @Get()
  @ApiOkDataResponse(AuditLogAdminListPayloadDto)
  async list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AuditLogAdminListQueryDto,
  ): Promise<OkResponse<AuditLogAdminListPayloadDto>> {
    return createOkResponse(await this.execute(() => this.audit.list(principal.tenantId, query)));
  }

  @Get('meta')
  @ApiOkDataResponse(AuditLogAdminMetadataDto)
  metadata(): OkResponse<AuditLogAdminMetadataDto> {
    return createOkResponse(this.audit.metadata());
  }

  @Get(':id')
  @ApiOkDataResponse(AuditLogAdminViewDto)
  async get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param() { id }: AuditLogAdminIdParamDto,
  ): Promise<OkResponse<AuditLogAdminViewDto>> {
    const entry = await this.execute(() => this.audit.get(id, principal.tenantId));
    if (!entry) {
      throw new NotFoundException();
    }
    return createOkResponse(entry);
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AuditLogAdminPersistenceError) {
        throw new InternalServerErrorException();
      }
      throw error;
    }
  }
}
