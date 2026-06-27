import type { Result } from "neverthrow";
import {
  DEFAULT_AUTH_TENANT_ID,
  type AuthenticatedPrincipal,
} from "@app/backend/feature/auth/shared";
import {
  isAdminAssignablePermission,
  isAdminAssignableRole,
  toAdminRbacCatalogView,
  type AdminRbacCatalogView,
} from "@app/backend/feature/admin/shared";
import type {
  AdminAuditLogEntity,
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AdminUserMutationResult,
  AuthUserEntity,
  AuthUserRepository,
} from "@app/backend/postgres/main/auth";
import {
  AdminApplicationError,
  isSensitiveAdminPolicyMessage,
} from "./admin-errors";
import type { AdminRequestContext } from "../domain/admin-request-context";
import {
  normalizeAdminPage,
  type AdminAuditLogListPayload,
  type AdminAuditLogView,
  type AdminAuditQuery,
  type AdminDashboardSummary,
  type AdminUserListPayload,
  type AdminUserQuery,
  type AdminUserView,
  type UpdateAdminUserAccessPolicyCommand,
  type UpdateAdminUserStatusCommand,
} from "../domain/admin-user";

export class AdminUsersUseCase {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly auditLogs: AdminAuditLogRepository,
    private readonly adminUserMutations: AdminUserMutationRepository,
  ) {}

  async listUsers(
    principal: AuthenticatedPrincipal,
    query: AdminUserQuery,
  ): Promise<AdminUserListPayload> {
    const { limit, offset } = normalizeAdminPage(query);
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

    return {
      items: unwrapRepositoryResult(items).map(toAdminUserView),
      total: unwrapRepositoryResult(total),
      limit,
      offset,
    };
  }

  async getUser(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<AdminUserView> {
    const user = await this.users.findById(id, resolveTenantId(principal));
    const entity = unwrapRepositoryResult(user);
    if (!entity) {
      throw new AdminApplicationError("not_found", "Admin user was not found.");
    }

    return toAdminUserView(entity);
  }

  async updateUserStatus(
    principal: AuthenticatedPrincipal,
    id: string,
    input: UpdateAdminUserStatusCommand,
    context: AdminRequestContext,
  ): Promise<AdminUserView> {
    const tenantId = resolveTenantId(principal);
    const mutation = await this.adminUserMutations.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId: id,
      actorUserId: principal.subject,
      action: "admin.user.status.update",
      policy: { status: input.status },
      audit: {
        actorUserId: principal.subject,
        metadata: { ...context },
      },
    });
    const result =
      unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new AdminApplicationError("not_found", "Admin user was not found.");
    }

    return toAdminUserView(result.after);
  }

  async updateUserAccessPolicy(
    principal: AuthenticatedPrincipal,
    id: string,
    input: UpdateAdminUserAccessPolicyCommand,
    context: AdminRequestContext,
  ): Promise<AdminUserView> {
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
        metadata: { ...context },
      },
    });
    const result =
      unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new AdminApplicationError("not_found", "Admin user was not found.");
    }

    return toAdminUserView(result.after);
  }

  roles(): AdminRbacCatalogView {
    return toAdminRbacCatalogView();
  }

  async listAudit(
    principal: AuthenticatedPrincipal,
    query: AdminAuditQuery,
  ): Promise<AdminAuditLogListPayload> {
    const { limit, offset } = normalizeAdminPage(query);
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

    return {
      items: unwrapRepositoryResult(items).map(toAdminAuditLogView),
      total: unwrapRepositoryResult(total),
      limit,
      offset,
    };
  }

  async dashboardSummary(
    principal: AuthenticatedPrincipal,
  ): Promise<AdminDashboardSummary> {
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

    return {
      totalUsers: unwrapRepositoryResult(totalUsers),
      activeUsers: unwrapRepositoryResult(activeUsers),
      disabledUsers: unwrapRepositoryResult(disabledUsers),
      invitedUsers: unwrapRepositoryResult(invitedUsers),
      recentAuditEvents: unwrapRepositoryResult(auditCount),
      recentAudit: unwrapRepositoryResult(audit).map(toAdminAuditLogView),
    };
  }
}

const resolveTenantId = (principal: AuthenticatedPrincipal): string =>
  principal.tenantId ?? DEFAULT_AUTH_TENANT_ID;

const requireAllowedPolicy = (
  input: UpdateAdminUserAccessPolicyCommand,
): void => {
  const unknownRoles = input.roles.filter(
    (role) => !isAdminAssignableRole(role),
  );
  const unknownPermissions = input.permissions.filter(
    (permission) => !isAdminAssignablePermission(permission),
  );
  if (unknownRoles.length > 0 || unknownPermissions.length > 0) {
    throw new AdminApplicationError(
      "invalid_access_policy",
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

  throw new AdminApplicationError(
    "repository_error",
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
  if (isSensitiveAdminPolicyMessage(message)) {
    throw new AdminApplicationError("sensitive_policy_violation", message);
  }

  throw new AdminApplicationError("repository_error", message);
};

const toIso = (value: Date | undefined | null): string | undefined =>
  value && value.getTime() > 0 ? value.toISOString() : undefined;

const toAdminUserView = (entity: AuthUserEntity): AdminUserView => ({
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
): AdminAuditLogView => ({
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
