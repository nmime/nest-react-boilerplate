import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { orderPermissionKeys, orderRoleKeys } from '@app/backend-feature-auth-shared';
import {
  AuthRoleStoreInjectToken,
  AuthUserStoreInjectToken,
  type AuthRoleStore,
  type AuthUserRecord,
  type AuthUserStore,
  type EffectiveAccess,
} from '../infrastructure';

export interface AssignBootstrapRolesInput {
  userId: string;
  tenantId: string;
  roleKeys: readonly string[];
  grantedByUserId?: string | null;
}

/**
 * Resolves a user's effective {roleKeys, permissionKeys} exclusively from the
 * normalized RBAC tables and projects them into the returned domain record.
 * No second authorization copy is persisted on `auth_users`.
 */
@Injectable()
export class EffectivePermissionService {
  constructor(
    @Inject(AuthRoleStoreInjectToken)
    private readonly roles: AuthRoleStore,
    @Inject(AuthUserStoreInjectToken)
    private readonly users: AuthUserStore,
  ) {}

  // Resolve the canonical effective access for a user from the RBAC join.
  async resolveEffectiveAccess(userId: string, tenantId: string): Promise<EffectiveAccess> {
    const resolved = await this.roles.resolveEffectiveAccess(userId, tenantId);
    if (resolved.isErr()) {
      throw new ConflictException(resolved.error.message);
    }

    return {
      roleKeys: orderRoleKeys(resolved.value.roleKeys),
      permissionKeys: orderPermissionKeys(resolved.value.permissionKeys),
    };
  }

  // Assign bootstrap roles to a user, then return the normalized projection.
  async assignRolesAndRefresh(input: AssignBootstrapRolesInput): Promise<AuthUserRecord | null> {
    const assigned = await this.roles.assignRoles({
      userId: input.userId,
      tenantId: input.tenantId,
      roleKeys: input.roleKeys,
      grantedByUserId: input.grantedByUserId,
    });
    if (assigned.isErr()) {
      throw new ConflictException(assigned.error.message);
    }

    return this.refresh(input.userId, input.tenantId);
  }

  // Recompute the effective access from normalized tables for the returned
  // record. The database user row contains profile/status fields only.
  async refresh(userId: string, tenantId: string): Promise<AuthUserRecord | null> {
    const access = await this.resolveEffectiveAccess(userId, tenantId);
    const current = await this.users.findById(userId, tenantId);
    if (current.isErr()) {
      throw new ConflictException(current.error.message);
    }
    return current.value ? { ...current.value, roles: access.roleKeys, permissions: access.permissionKeys } : null;
  }
}
