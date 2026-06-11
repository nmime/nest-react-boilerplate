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
import type { Result } from "neverthrow";
import { createOkResponse, type OkResponse } from "@app/common/response";
import {
  ApiOkDataResponse,
  ApiExceptions,
  ApiSessionCookieAuth,
} from "@app/common/swagger";
import {
  CurrentUser,
  DEFAULT_AUTH_TENANT_ID,
  RequirePermissions,
  RequireRoles,
  SessionAuthGuard,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
} from "@app/feature-auth-shared";
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
  isAdminAssignablePermission,
  isAdminAssignableRole,
  toAdminRbacCatalogView,
} from "@app/backend/feature-admin-shared";
import {
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AuthUserRepository,
  type AdminUserMutationResult,
  type AdminAuditLogEntity,
  type AuthUserEntity,
  type AuthUserStatus,
} from "@app/postgres-main-auth";
import { AdminRbacGuard } from "./admin-rbac.guard";

const userStatuses = ["active", "disabled", "invited"] as const;
const adminAuditActions = [
  "admin.user.status.update",
  "admin.user.access_policy.update",
] as const;
const MAX_PAGE_SIZE = 100;

type AdminAuditAction = (typeof adminAuditActions)[number];

class AdminUserQueryDto {
  @ApiPropertyOptional({ maximum: MAX_PAGE_SIZE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
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

  @ApiPropertyOptional({ enum: userStatuses })
  @IsOptional()
  @IsIn(userStatuses)
  status?: AuthUserStatus;

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
  @ApiPropertyOptional({ maximum: MAX_PAGE_SIZE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
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
  @ApiProperty({ enum: userStatuses })
  @IsIn(userStatuses)
  status!: AuthUserStatus;
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

  @ApiProperty({ enum: userStatuses })
  status!: AuthUserStatus;

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

const normalizePage = (query: { limit?: number; offset?: number }) => ({
  limit: Math.min(query.limit ?? 50, MAX_PAGE_SIZE),
  offset: query.offset ?? 0,
});

const resolveTenantId = (principal: AuthenticatedPrincipal): string =>
  principal.tenantId ?? DEFAULT_AUTH_TENANT_ID;

const requireAllowedPolicy = (input: UpdateAdminUserAccessPolicyDto): void => {
  const unknownRoles = input.roles.filter(
    (role) => !isAdminAssignableRole(role),
  );
  const unknownPermissions = input.permissions.filter(
    (permission) => !isAdminAssignablePermission(permission),
  );
  if (unknownRoles.length > 0 || unknownPermissions.length > 0) {
    throw new BadRequestException(
      "Access policy contains roles or permissions outside the admin catalog.",
    );
  }
};

const unwrapRepositoryResult = <T>(
  result: Result<T, { message?: string }>,
): T => {
  if (result.isOk()) {
    return result.value;
  }

  throw new InternalServerErrorException(
    result.error.message ?? "Admin repository operation failed.",
  );
};

const unwrapSensitiveMutationResult = <T>(
  result: Result<T, { message?: string }>,
): T => {
  if (result.isOk()) {
    return result.value;
  }

  const message = result.error.message ?? "Admin repository operation failed.";
  if (
    message ===
      "Administrators cannot remove their own active admin write access." ||
    message ===
      "At least one active administrator must retain admin write access."
  ) {
    throw new BadRequestException(message);
  }

  throw new InternalServerErrorException(message);
};

const toIso = (value: Date | undefined | null): string | undefined =>
  value && value.getTime() > 0 ? value.toISOString() : undefined;

const toAdminUserView = (entity: AuthUserEntity): AdminUserViewDto => ({
  id: entity.id,
  tenantId: entity.tenantId,
  email: entity.email,
  ...(entity.displayName ? { displayName: entity.displayName } : {}),
  status: entity.status,
  roles: entity.roles,
  permissions: entity.permissions,
  ...(entity.locale ? { locale: entity.locale } : {}),
  ...(entity.theme ? { theme: entity.theme } : {}),
  ...(toIso(entity.lastLoginAt)
    ? { lastLoginAt: toIso(entity.lastLoginAt) }
    : {}),
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});

const toAdminAuditLogView = (
  entity: AdminAuditLogEntity,
): AdminAuditLogViewDto => ({
  id: entity.id,
  tenantId: entity.tenantId,
  ...(entity.actorUserId ? { actorUserId: entity.actorUserId } : {}),
  action: entity.action,
  resource: entity.resource,
  ...(entity.targetUserId ? { targetUserId: entity.targetUserId } : {}),
  before: entity.before,
  after: entity.after,
  metadata: entity.metadata,
  createdAt: entity.createdAt.toISOString(),
});

const metadataFromRequest = (
  request: AuthenticatedRequest,
): Record<string, unknown> => ({
  ...(normalizeHeaderScalar(request.headers?.["x-request-id"])
    ? { requestId: normalizeHeaderScalar(request.headers?.["x-request-id"]) }
    : {}),
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
  constructor(
    private readonly users: AuthUserRepository,
    private readonly auditLogs: AdminAuditLogRepository,
    private readonly adminUserMutations: AdminUserMutationRepository,
  ) {}

  @Get("users")
  @ApiOkDataResponse(AdminUserListPayloadDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_USERS_READ_PERMISSION)
  async listUsers(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AdminUserQueryDto,
  ): Promise<OkResponse<AdminUserListPayloadDto>> {
    const { limit, offset } = normalizePage(query);
    const tenantId = resolveTenantId(principal);
    const filter = {
      tenantId,
      search: query.search?.trim(),
      status: query.status,
      role: query.role,
      permission: query.permission,
      limit,
      offset,
    };
    const [items, total] = await Promise.all([
      this.users.listUsers(filter),
      this.users.countUsers(filter),
    ]);

    return createOkResponse({
      items: unwrapRepositoryResult(items).map(toAdminUserView),
      total: unwrapRepositoryResult(total),
      limit,
      offset,
    });
  }

  @Get("users/:id")
  @ApiOkDataResponse(AdminUserViewDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_USERS_READ_PERMISSION)
  async getUser(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") id: string,
  ): Promise<OkResponse<AdminUserViewDto>> {
    const user = await this.users.findById(id, resolveTenantId(principal));
    const entity = unwrapRepositoryResult(user);
    if (!entity) {
      throw new NotFoundException("Admin user was not found.");
    }

    return createOkResponse(toAdminUserView(entity));
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
  ): Promise<OkResponse<AdminUserViewDto>> {
    const tenantId = resolveTenantId(principal);
    const mutation = await this.adminUserMutations.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId: id,
      actorUserId: principal.subject,
      action: "admin.user.status.update",
      policy: { status: input.status },
      audit: {
        actorUserId: principal.subject,
        metadata: metadataFromRequest(request),
      },
    });
    const result =
      unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new NotFoundException("Admin user was not found.");
    }

    return createOkResponse(toAdminUserView(result.after));
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
  ): Promise<OkResponse<AdminUserViewDto>> {
    requireAllowedPolicy(input);
    const tenantId = resolveTenantId(principal);
    const mutation = await this.adminUserMutations.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId: id,
      actorUserId: principal.subject,
      action: "admin.user.access_policy.update",
      policy: {
        roles: input.roles,
        permissions: input.permissions,
      },
      audit: {
        actorUserId: principal.subject,
        metadata: metadataFromRequest(request),
      },
    });
    const result =
      unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new NotFoundException("Admin user was not found.");
    }

    return createOkResponse(toAdminUserView(result.after));
  }

  @Get("roles")
  @ApiOkDataResponse(AdminRbacCatalogPayloadDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_ROLES_READ_PERMISSION)
  roles(): OkResponse<AdminRbacCatalogPayloadDto> {
    const catalog = toAdminRbacCatalogView();

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
  ): Promise<OkResponse<AdminAuditLogListPayloadDto>> {
    const { limit, offset } = normalizePage(query);
    const filter = {
      tenantId: resolveTenantId(principal),
      action: query.action,
      actorUserId: query.actorUserId,
      targetUserId: query.targetUserId,
      limit,
      offset,
    };
    const [items, total] = await Promise.all([
      this.auditLogs.list(filter),
      this.auditLogs.count(filter),
    ]);

    return createOkResponse({
      items: unwrapRepositoryResult(items).map(toAdminAuditLogView),
      total: unwrapRepositoryResult(total),
      limit,
      offset,
    });
  }

  @Get("dashboard/summary")
  @ApiOkDataResponse(AdminDashboardSummaryDto)
  @RequireRoles(ADMIN_ROLE)
  @RequirePermissions(ADMIN_DASHBOARD_READ_PERMISSION)
  async dashboardSummary(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<OkResponse<AdminDashboardSummaryDto>> {
    const tenantId = resolveTenantId(principal);
    const [
      totalUsers,
      activeUsers,
      disabledUsers,
      invitedUsers,
      auditCount,
      audit,
    ] = await Promise.all([
      this.users.countUsers({ tenantId }),
      this.users.countUsers({ tenantId, status: "active" }),
      this.users.countUsers({ tenantId, status: "disabled" }),
      this.users.countUsers({ tenantId, status: "invited" }),
      this.auditLogs.count({ tenantId }),
      this.auditLogs.list({ tenantId, limit: 5, offset: 0 }),
    ]);

    return createOkResponse({
      totalUsers: unwrapRepositoryResult(totalUsers),
      activeUsers: unwrapRepositoryResult(activeUsers),
      disabledUsers: unwrapRepositoryResult(disabledUsers),
      invitedUsers: unwrapRepositoryResult(invitedUsers),
      recentAuditEvents: unwrapRepositoryResult(auditCount),
      recentAudit: unwrapRepositoryResult(audit).map(toAdminAuditLogView),
    });
  }
}
