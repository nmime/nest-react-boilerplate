import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import {
  createOkResponse,
  type OkResponse,
} from "@app/backend/common/response";
import {
  ApiOkDataResponse,
  ApiExceptions,
  ApiSessionCookieAuth,
} from "@app/backend/common/swagger";
import {
  CurrentUser,
  RequirePermissions,
  RequireRoles,
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from "@app/backend/feature/auth/shared";
import {
  ADMIN_AUDIT_READ_PERMISSION,
  ADMIN_DASHBOARD_READ_PERMISSION,
  ADMIN_ROLE,
  ADMIN_ROLES_READ_PERMISSION,
  ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
  ADMIN_USERS_READ_PERMISSION,
  ADMIN_USERS_STATUS_UPDATE_PERMISSION,
  ADMIN_USERS_WRITE_PERMISSION,
  adminAssignablePermissions,
  adminAssignableRoles,
} from "@app/backend/feature/admin/shared";
import { AdminApplicationError } from "../../application/admin-errors";
import { AdminUsersUseCase } from "../../application/admin-users.use-case";
import {
  createAdminRequestContext,
  type AdminRequestContext,
} from "../../domain/admin-request-context";
import {
  ADMIN_MAX_PAGE_SIZE,
  adminAuditActions,
  adminUserStatuses,
  type AdminAuditAction,
  type AdminAuditLogListPayload,
  type AdminDashboardSummary,
  type AdminUserListPayload,
  type AdminUserStatus,
  type AdminUserView,
} from "../../domain/admin-user";
import { AdminRbacGuard } from "./admin-rbac.guard";

class AdminUserQueryDto {
  @ApiPropertyOptional({ maximum: ADMIN_MAX_PAGE_SIZE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    description: "Case-insensitive email/display name search.",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: adminUserStatuses })
  @IsOptional()
  @IsIn(adminUserStatuses)
  status?: AdminUserStatus;

  @ApiPropertyOptional({ enum: adminAssignableRoles })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: adminAssignablePermissions })
  @IsOptional()
  @IsString()
  permission?: string;
}

class AdminAuditQueryDto {
  @ApiPropertyOptional({ maximum: ADMIN_MAX_PAGE_SIZE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: adminAuditActions })
  @IsOptional()
  @IsIn(adminAuditActions)
  action?: AdminAuditAction;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;
}

class UpdateAdminUserStatusDto {
  @ApiProperty({ enum: adminUserStatuses })
  @IsIn(adminUserStatuses)
  status!: AdminUserStatus;
}

class UpdateAdminUserAccessPolicyDto {
  @ApiProperty({ enum: adminAssignableRoles, isArray: true })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];

  @ApiProperty({ enum: adminAssignablePermissions, isArray: true })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class AdminUserViewDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  tenantId!: string;

  @ApiProperty({ format: "email" })
  email!: string;

  @ApiPropertyOptional()
  displayName?: string;

  @ApiProperty({ enum: adminUserStatuses })
  status!: AdminUserStatus;

  @ApiProperty({ items: { type: "string" }, type: "array" })
  roles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];

  @ApiPropertyOptional()
  locale?: string;

  @ApiPropertyOptional({ enum: ["system", "light", "dark"] })
  theme?: string;

  @ApiPropertyOptional({ format: "date-time" })
  lastLoginAt?: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;

  @ApiProperty({ format: "date-time" })
  updatedAt!: string;
}

class AdminUserListPayloadDto {
  @ApiProperty({ type: () => AdminUserViewDto, isArray: true })
  items!: AdminUserViewDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

class AdminRbacPermissionDto {
  @ApiProperty()
  permission!: string;

  @ApiProperty()
  resource!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  description!: string;
}

class AdminRbacRoleDto {
  @ApiProperty()
  role!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ items: { type: "string" }, type: "array" })
  permissions!: string[];
}

class AdminRbacCatalogPayloadDto {
  @ApiProperty({ items: { type: "string" }, type: "array" })
  resources!: string[];

  @ApiProperty({ type: () => AdminRbacRoleDto, isArray: true })
  roles!: AdminRbacRoleDto[];

  @ApiProperty({ type: () => AdminRbacPermissionDto, isArray: true })
  permissions!: AdminRbacPermissionDto[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  assignableRoles!: string[];

  @ApiProperty({ items: { type: "string" }, type: "array" })
  assignablePermissions!: string[];
}

class AdminAuditLogViewDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  tenantId!: string;

  @ApiPropertyOptional({ format: "uuid" })
  actorUserId?: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  resource!: string;

  @ApiPropertyOptional({ format: "uuid" })
  targetUserId?: string;

  @ApiProperty({ additionalProperties: true, type: "object" })
  before!: Record<string, unknown>;

  @ApiProperty({ additionalProperties: true, type: "object" })
  after!: Record<string, unknown>;

  @ApiProperty({ additionalProperties: true, type: "object" })
  metadata!: Record<string, unknown>;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

class AdminAuditLogListPayloadDto {
  @ApiProperty({ type: () => AdminAuditLogViewDto, isArray: true })
  items!: AdminAuditLogViewDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

class AdminDashboardSummaryDto {
  @ApiProperty()
  totalUsers!: number;

  @ApiProperty()
  activeUsers!: number;

  @ApiProperty()
  disabledUsers!: number;

  @ApiProperty()
  invitedUsers!: number;

  @ApiProperty()
  recentAuditEvents!: number;

  @ApiProperty({ type: () => AdminAuditLogViewDto, isArray: true })
  recentAudit!: AdminAuditLogViewDto[];
}

const toHttpException = (error: unknown): never => {
  if (error instanceof AdminApplicationError) {
    if (error.code === "not_found") {
      throw new NotFoundException(error.message);
    }
    if (
      error.code === "invalid_access_policy" ||
      error.code === "sensitive_policy_violation"
    ) {
      throw new BadRequestException(error.message);
    }

    throw new InternalServerErrorException(error.message);
  }

  throw error;
};

const executeAdminUseCase = async <T>(
  handler: () => Promise<T>,
): Promise<T> => {
  try {
    return await handler();
  } catch (error) {
    return toHttpException(error);
  }
};

const requestContextFromRequest = (
  request: AuthenticatedRequest,
): AdminRequestContext =>
  createAdminRequestContext({
    requestId: normalizeHeaderScalar(request.headers?.["x-request-id"]),
  });

const normalizeHeaderScalar = (
  value: string | string[] | undefined,
): string | undefined => {
  const scalar = Array.isArray(value) ? value[0] : value;
  const trimmed = scalar?.trim();

  return trimmed ? trimmed.slice(0, 256) : undefined;
};

@ApiExceptions(400, 401, 403, 404, 429, 500)
@ApiBearerAuth()
@ApiSessionCookieAuth()
@UseGuards(new SessionAuthGuard(), new AdminRbacGuard())
@Controller("admin")
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersUseCase) {}

  @Get("users")
  @ApiOkDataResponse(AdminUserListPayloadDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_USERS_READ_PERMISSION)
  async listUsers(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AdminUserQueryDto,
  ): Promise<OkResponse<AdminUserListPayload>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.listUsers(principal, query),
      ),
    );
  }

  @Get("users/:id")
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_USERS_READ_PERMISSION)
  async getUser(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") id: string,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(
      await executeAdminUseCase(() => this.adminUsers.getUser(principal, id)),
    );
  }

  @Patch("users/:id/status")
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(
    ADMIN_USERS_WRITE_PERMISSION,
    ADMIN_USERS_STATUS_UPDATE_PERMISSION,
  )
  async updateUserStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Body() input: UpdateAdminUserStatusDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.updateUserStatus(
          principal,
          id,
          input,
          requestContextFromRequest(request),
        ),
      ),
    );
  }

  @Patch("users/:id/access-policy")
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(
    ADMIN_USERS_WRITE_PERMISSION,
    ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
  )
  async updateUserAccessPolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") id: string,
    @Body() input: UpdateAdminUserAccessPolicyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OkResponse<AdminUserView>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.updateUserAccessPolicy(
          principal,
          id,
          input,
          requestContextFromRequest(request),
        ),
      ),
    );
  }

  @Get("roles")
  @ApiOkDataResponse(AdminRbacCatalogPayloadDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_ROLES_READ_PERMISSION)
  roles(): OkResponse<AdminRbacCatalogPayloadDto> {
    const catalog = this.adminUsers.roles();

    return createOkResponse({
      resources: [...catalog.resources],
      roles: catalog.roles.map((role) => ({
        ...role,
        permissions: [...role.permissions],
      })),
      permissions: catalog.permissions.map((permission) => ({ ...permission })),
      assignableRoles: [...catalog.assignableRoles],
      assignablePermissions: [...catalog.assignablePermissions],
    });
  }

  @Get("audit")
  @ApiOkDataResponse(AdminAuditLogListPayloadDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_AUDIT_READ_PERMISSION)
  async listAudit(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AdminAuditQueryDto,
  ): Promise<OkResponse<AdminAuditLogListPayload>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.listAudit(principal, query),
      ),
    );
  }

  @Get("dashboard/summary")
  @ApiOkDataResponse(AdminDashboardSummaryDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_DASHBOARD_READ_PERMISSION)
  async dashboardSummary(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<AdminDashboardSummary>> {
    return createOkResponse(
      await executeAdminUseCase(() =>
        this.adminUsers.dashboardSummary(principal),
      ),
    );
  }
}
