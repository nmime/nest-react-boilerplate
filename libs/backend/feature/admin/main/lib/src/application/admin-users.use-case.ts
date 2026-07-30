import type {
  AuthenticatedPrincipal,
  AdminAuditLogRepositoryPort,
  AdminUserMutationRepositoryPort,
  AdminUserMutationResult,
  AuthPermissionRecord,
  AuthRoleRecord,
  AuthRoleRepositoryPort,
  AuthUserRepositoryPort,
  AdminAuditLogRecord,
  AuthUserPersistenceRecord,
} from '@app/backend-feature-auth-shared';
import { AdminApplicationError } from './admin-errors';
import {
  normalizeAdminPage,
  type AdminRequestContext,
  type AdminDashboardSummary,
  type AdminUserListPayload,
  type AdminUserQuery,
  type AdminUserView,
  type UpdateAdminUserAccessPolicyCommand,
  type UpdateAdminUserStatusCommand,
} from '../domain';
import { toAdminAuditLogView, toAdminUserView } from './mapper';
import { requireAllowedPolicy, resolveTenantId, unwrapRepositoryResult, unwrapSensitiveMutationResult } from './util';

export class AdminUsersUseCase {
  constructor(
    private readonly users: AuthUserRepositoryPort,
    private readonly auditLogs: AdminAuditLogRepositoryPort,
    private readonly adminUserMutations: AdminUserMutationRepositoryPort,
    private readonly roles: AuthRoleRepositoryPort,
  ) {}

  async listUsers(principal: AuthenticatedPrincipal, query: AdminUserQuery): Promise<AdminUserListPayload> {
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
    const [items, total] = await Promise.all([this.users.listUsers(filter), this.users.countUsers(filter)]);

    return {
      items: unwrapRepositoryResult<AuthUserPersistenceRecord[]>(items).map(toAdminUserView),
      total: unwrapRepositoryResult<number>(total),
      limit,
      offset,
    };
  }

  async getUser(principal: AuthenticatedPrincipal, id: string): Promise<AdminUserView> {
    const user = await this.users.findById(id, resolveTenantId(principal));
    const entity = unwrapRepositoryResult<AuthUserPersistenceRecord | null>(user);
    if (!entity) {
      throw new AdminApplicationError('not_found', 'Admin user was not found.');
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
      action: 'admin.user.status.update',
      policy: { status: input.status },
      audit: {
        actorUserId: principal.subject,
        metadata: { ...context, reason: input.reason.trim() },
      },
    });
    const result = unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new AdminApplicationError('not_found', 'Admin user was not found.');
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
    await this.requireKnownRoles(input.roles, tenantId);
    await this.requireDatabasePermissions(input.permissions);
    const mutation = await this.adminUserMutations.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId: id,
      actorUserId: principal.subject,
      action: 'admin.user.access_policy.update',
      policy: {
        roles: input.roles,
        permissions: input.permissions,
      },
      audit: {
        actorUserId: principal.subject,
        metadata: { ...context, reason: input.reason.trim() },
      },
    });
    const result = unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new AdminApplicationError('not_found', 'Admin user was not found.');
    }

    return toAdminUserView(result.after);
  }

  async dashboardSummary(principal: AuthenticatedPrincipal): Promise<AdminDashboardSummary> {
    const tenantId = resolveTenantId(principal);
    const [totalUsers, activeUsers, disabledUsers, invitedUsers, auditCount, audit] = await Promise.all([
      this.users.countUsers({ tenantId }),
      this.users.countUsers({ tenantId, status: 'active' }),
      this.users.countUsers({ tenantId, status: 'disabled' }),
      this.users.countUsers({ tenantId, status: 'invited' }),
      this.auditLogs.count({ tenantId }),
      this.auditLogs.list({ tenantId, limit: 5, offset: 0 }),
    ]);

    return {
      totalUsers: unwrapRepositoryResult<number>(totalUsers),
      activeUsers: unwrapRepositoryResult<number>(activeUsers),
      disabledUsers: unwrapRepositoryResult<number>(disabledUsers),
      invitedUsers: unwrapRepositoryResult<number>(invitedUsers),
      recentAuditEvents: unwrapRepositoryResult<number>(auditCount),
      recentAudit: unwrapRepositoryResult<AdminAuditLogRecord[]>(audit).map(toAdminAuditLogView),
    };
  }

  private async requireKnownRoles(roleKeys: readonly string[], tenantId: string): Promise<void> {
    if (roleKeys.length === 0) {
      return;
    }
    const found = unwrapRepositoryResult<AuthRoleRecord[]>(await this.roles.findByKeys(roleKeys, tenantId));
    const foundKeys = new Set(found.map((role) => role.key));
    const unknown = roleKeys.filter((key) => !foundKeys.has(key));
    if (unknown.length > 0) {
      throw new AdminApplicationError(
        'invalid_access_policy',
        `Unknown role keys for this tenant: ${unknown.join(', ')}.`,
      );
    }
  }

  private async requireDatabasePermissions(permissionKeys: readonly string[]): Promise<void> {
    if (permissionKeys.length === 0) {
      return;
    }
    const found = unwrapRepositoryResult<AuthPermissionRecord[]>(
      await this.roles.findPermissionsByKeys(permissionKeys),
    );
    const foundKeys = new Set(found.map((permission) => permission.key));
    const missing = permissionKeys.filter((key) => !foundKeys.has(key));
    if (missing.length > 0) {
      throw new AdminApplicationError(
        'repository_error',
        `RBAC permission catalog is missing database rows: ${missing.join(', ')}.`,
      );
    }
  }
}
