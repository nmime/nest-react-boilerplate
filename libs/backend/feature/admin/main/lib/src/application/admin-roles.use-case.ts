import type { EntityManager } from '@mikro-orm/core';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import { AdminManageAllPermission, AdminRole } from '@app/common-authz';
import type {
  AuthRoleRepository,
  AdminAuditLogRepository,
  AdminUserMutationRepository,
  AdminUserMutationResult,
  AuthPermissionEntity,
  AuthRoleEntity,
  AuthRoleWithPermissions,
} from '@app/backend-postgres-main-auth';
import { AdminApplicationError } from './admin-errors';
import { adminRoleInvariantPermissions } from './const';
import { toAdminRoleView, toAdminUserView, toPermissionView } from './mapper';
import {
  orderPermissionViews,
  requireKnownPermissions,
  resolveTenantId,
  unwrapRepositoryResult,
  unwrapSensitiveMutationResult,
} from './util';
import type {
  AdminRbacCatalog,
  AdminRoleView,
  AdminRequestContext,
  AdminUserView,
  AssignAdminUserRolesCommand,
  CreateAdminRoleCommand,
  SetAdminRolePermissionsCommand,
  UpdateAdminRoleCommand,
} from '../domain';

export class AdminRolesUseCase {
  constructor(
    private readonly roles: AuthRoleRepository,
    private readonly adminUserMutations: AdminUserMutationRepository,
    private readonly auditLogs?: AdminAuditLogRepository,
  ) {}

  async listRolesCatalog(principal: AuthenticatedPrincipal): Promise<AdminRbacCatalog> {
    const tenantId = resolveTenantId(principal);
    const rolesWithPermissions = unwrapRepositoryResult<AuthRoleWithPermissions[]>(
      await this.roles.listRolesWithPermissions(tenantId),
    );
    const permissions = unwrapRepositoryResult<AuthPermissionEntity[]>(await this.roles.listPermissions());

    const permissionViews = orderPermissionViews(permissions.map(toPermissionView));
    const roleViews = rolesWithPermissions.map(toAdminRoleView);
    const resources = [...new Set(permissionViews.map((permission) => permission.resource))].sort((left, right) =>
      left.localeCompare(right),
    );

    return {
      resources,
      roles: roleViews,
      permissions: permissionViews,
      assignableRoles: roleViews.map((role) => role.role),
      assignablePermissions: permissionViews.map((permission) => permission.permission),
    };
  }

  async createRole(
    principal: AuthenticatedPrincipal,
    input: CreateAdminRoleCommand,
    context: AdminRequestContext = {},
  ): Promise<AdminRoleView> {
    const tenantId = resolveTenantId(principal);
    const key = input.key.trim();
    if (key.length === 0) {
      throw new AdminApplicationError('invalid_access_policy', 'A role key is required.');
    }
    const requestedPermissions = requireKnownPermissions(input.permissions ?? []);
    await this.requireDatabasePermissions(requestedPermissions);
    this.requireNoManageAllForCustomRole(requestedPermissions);

    return this.auditedRoleMutation(principal, 'admin.role.create', context, async (entityManager) => {
      const existing = unwrapRepositoryResult<AuthRoleEntity | null>(
        await this.roles.findByKey(key, tenantId, entityManager),
      );
      if (existing) {
        throw new AdminApplicationError('conflict', `A role with key "${key}" already exists.`);
      }
      const created = unwrapRepositoryResult<AuthRoleEntity>(
        await this.roles.createRole(
          {
            tenantId,
            key,
            label: input.label?.trim(),
            description: input.description?.trim(),
            isSystem: false,
          },
          entityManager,
        ),
      );
      if (requestedPermissions.length === 0) {
        return { before: {}, after: toAdminRoleView({ role: created, permissionKeys: [] }) };
      }
      const updated = unwrapRepositoryResult<AuthRoleWithPermissions | null>(
        await this.roles.setRolePermissions(created.id, requestedPermissions, tenantId, undefined, entityManager),
      );
      if (!updated) {
        throw new AdminApplicationError('not_found', 'Role was not found.');
      }
      return { before: {}, after: toAdminRoleView(updated) };
    });
  }

  async updateRole(
    principal: AuthenticatedPrincipal,
    id: string,
    input: UpdateAdminRoleCommand,
    context: AdminRequestContext = {},
  ): Promise<AdminRoleView> {
    const tenantId = resolveTenantId(principal);
    return this.auditedRoleMutation(principal, 'admin.role.update', context, async (entityManager) => {
      const before = await this.roleViewFor(id, tenantId, entityManager);
      const updated = unwrapRepositoryResult<AuthRoleEntity | null>(
        await this.roles.updateRole(
          id,
          {
            ...(input.label !== undefined ? { label: input.label.trim() } : {}),
            ...(input.description !== undefined ? { description: input.description.trim() } : {}),
          },
          tenantId,
          entityManager,
        ),
      );
      if (!updated) {
        throw new AdminApplicationError('not_found', 'Role was not found.');
      }
      return { before, after: await this.roleViewFor(updated.id, tenantId, entityManager) };
    });
  }

  async setRolePermissions(
    principal: AuthenticatedPrincipal,
    id: string,
    input: SetAdminRolePermissionsCommand,
    context: AdminRequestContext = {},
  ): Promise<AdminRoleView> {
    const tenantId = resolveTenantId(principal);
    const requestedPermissions = requireKnownPermissions(input.permissions);
    await this.requireDatabasePermissions(requestedPermissions);

    return this.auditedRoleMutation(principal, 'admin.role.permissions.update', context, async (entityManager) => {
      const before = await this.roleViewFor(id, tenantId, entityManager);
      const role = unwrapRepositoryResult<AuthRoleEntity | null>(
        await this.roles.findById(id, tenantId, entityManager),
      );
      if (!role) {
        throw new AdminApplicationError('not_found', 'Role was not found.');
      }
      if (role.isSystem && role.key === AdminRole) {
        const missing = adminRoleInvariantPermissions.filter(
          (permission) => !requestedPermissions.includes(permission),
        );
        if (missing.length > 0) {
          throw new AdminApplicationError(
            'sensitive_policy_violation',
            `The admin role must retain its core management grants: ${missing.join(', ')}.`,
          );
        }
      } else {
        this.requireNoManageAllForCustomRole(requestedPermissions);
      }
      const updated = unwrapSensitiveMutationResult<AuthRoleWithPermissions | null>(
        await this.roles.setRolePermissions(id, requestedPermissions, tenantId, principal.subject, entityManager),
      );
      if (!updated) {
        throw new AdminApplicationError('not_found', 'Role was not found.');
      }
      return { before, after: toAdminRoleView(updated) };
    });
  }

  async assignUserRoles(
    principal: AuthenticatedPrincipal,
    userId: string,
    input: AssignAdminUserRolesCommand,
    context: AdminRequestContext,
  ): Promise<AdminUserView> {
    const tenantId = resolveTenantId(principal);
    const desiredRoleKeys = [...new Set(input.roles)];
    await this.requireKnownRoles(desiredRoleKeys, tenantId);

    const mutation = await this.adminUserMutations.mutateUserRolesWithAudit({
      tenantId,
      targetUserId: userId,
      actorUserId: principal.subject,
      desiredRoleKeys,
      audit: {
        actorUserId: principal.subject,
        metadata: { ...context },
      },
    });
    const result = unwrapSensitiveMutationResult<AdminUserMutationResult | null>(mutation);
    if (!result) {
      throw new AdminApplicationError('not_found', 'Admin user was not found.');
    }

    return toAdminUserView(result.after);
  }

  private async roleViewFor(id: string, tenantId: string, entityManager?: EntityManager): Promise<AdminRoleView> {
    const rolesWithPermissions = unwrapRepositoryResult<AuthRoleWithPermissions[]>(
      await this.roles.listRolesWithPermissions(tenantId, entityManager),
    );
    const match = rolesWithPermissions.find((entry) => entry.role.id === id);
    if (!match) {
      throw new AdminApplicationError('not_found', 'Role was not found.');
    }

    return toAdminRoleView(match);
  }

  private async requireKnownRoles(roleKeys: readonly string[], tenantId: string): Promise<void> {
    if (roleKeys.length === 0) {
      return;
    }
    const found = unwrapRepositoryResult<AuthRoleEntity[]>(await this.roles.findByKeys(roleKeys, tenantId));
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
    const found = unwrapRepositoryResult<AuthPermissionEntity[]>(
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

  private requireNoManageAllForCustomRole(permissionKeys: readonly string[]): void {
    if (permissionKeys.includes(AdminManageAllPermission)) {
      throw new AdminApplicationError(
        'invalid_access_policy',
        'The break-glass admin:manage:all permission can only remain on the protected system admin role.',
      );
    }
  }

  private async auditedRoleMutation(
    principal: AuthenticatedPrincipal,
    action: 'admin.role.create' | 'admin.role.update' | 'admin.role.permissions.update',
    context: AdminRequestContext,
    operation: (
      entityManager?: EntityManager,
    ) => Promise<{ before: AdminRoleView | Record<string, never>; after: AdminRoleView }>,
  ): Promise<AdminRoleView> {
    if (!this.auditLogs) {
      return (await operation()).after;
    }
    const result = await this.auditLogs.recordTransactionally({
      operation: (entityManager) => operation(entityManager),
      audit: ({ before, after }) => ({
        tenantId: resolveTenantId(principal),
        actorUserId: principal.subject,
        action,
        resource: 'admin.roles',
        targetUserId: after.id,
        before: { ...before },
        after: { ...after },
        metadata: { ...context },
      }),
    });
    return result.after;
  }
}
