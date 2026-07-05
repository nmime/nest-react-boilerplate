import { ConflictException, Inject, Injectable } from "@nestjs/common";
import {
  orderPermissionKeys,
  orderRoleKeys,
} from "@app/backend-feature-auth-shared";
import {
  AuthRoleStoreInjectToken,
  AuthUserStoreInjectToken,
  type AuthRoleStore,
  type AuthUserRecord,
  type AuthUserStore,
  type EffectiveAccess,
} from "../infrastructure";

export interface AssignBootstrapRolesInput {
  userId: string;
  tenantId: string;
  roleKeys: readonly string[];
  grantedByUserId?: string | null;
}

/**
 * Resolves a user's effective {roleKeys, permissionKeys} from the normalized
 * RBAC tables and refreshes the denormalized `auth_users.roles/permissions`
 * jsonb cache the JWT/session hot path reads. The resolved arrays are ordered
 * canonically (catalog order) so the cache stays byte-for-byte identical to
 * what `createDefaultAccessPolicy` produced from the shared matrix — the
 * token/session shape is therefore unchanged.
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
  async resolveEffectiveAccess(
    userId: string,
    tenantId: string,
  ): Promise<EffectiveAccess> {
    const resolved = await this.roles.resolveEffectiveAccess(userId, tenantId);
    if (resolved.isErr()) {
      throw new ConflictException(resolved.error.message);
    }

    return {
      roleKeys: orderRoleKeys(resolved.value.roleKeys),
      permissionKeys: orderPermissionKeys(resolved.value.permissionKeys),
    };
  }

  // Assign bootstrap roles to a user, then refresh the jsonb cache and return
  // the updated record. Used by the account-creation paths.
  async assignRolesAndRefresh(
    input: AssignBootstrapRolesInput,
  ): Promise<AuthUserRecord | null> {
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

  // Recompute the effective access from the normalized tables and write it back
  // into the denormalized jsonb cache. If the normalized tables resolve no
  // roles (e.g. a tenant whose system roles are not seeded yet), the cache is
  // left untouched so previously persisted claims are never silently wiped.
  async refresh(
    userId: string,
    tenantId: string,
  ): Promise<AuthUserRecord | null> {
    const access = await this.resolveEffectiveAccess(userId, tenantId);
    if (access.roleKeys.length === 0) {
      const current = await this.users.findById(userId, tenantId);
      return current.isOk() ? current.value : null;
    }

    const updated = await this.users.setAccessPolicy(
      userId,
      { roles: access.roleKeys, permissions: access.permissionKeys },
      tenantId,
    );
    if (updated.isErr()) {
      throw new ConflictException(updated.error.message);
    }

    return updated.value;
  }
}
