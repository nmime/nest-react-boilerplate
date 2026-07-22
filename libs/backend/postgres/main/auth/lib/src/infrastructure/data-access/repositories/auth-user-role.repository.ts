import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import { AuthRoleEntity, AuthUserRoleEntity, DefaultAuthTenantId } from '../entities';
import { listRoleKeysSql, resolveEffectiveAccessSql } from './const/auth-user-role.sql';
import { mapAuthRoleRepositoryError } from './mapper/auth-role-error.mapper';
import type { AuthRoleRepositoryError } from './type/auth-role.type';
import type { EffectiveAccessRow, RoleKeyRow } from './type/auth-user-role-internal.type';
import type { AssignAuthUserRolesInput, EffectiveAuthAccess } from './type/auth-user-role.type';

export * from './type/auth-user-role.type';

/**
 * Reads and writes the normalized RBAC assignment tables (`auth_user_roles`)
 * and resolves a user's effective access by joining
 * `auth_user_roles -> auth_role_permissions -> auth_permissions` (with
 * `auth_roles` supplying the role key). These normalized joins are the sole
 * persisted authorization source of truth.
 */
@Injectable()
export class AuthUserRoleRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  assignRoles(input: AssignAuthUserRolesInput): ResultAsync<string[], AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(this.reconcileAssignments(input), mapAuthRoleRepositoryError);
  }

  listRoleKeys(userId: string, tenantId: string = DefaultAuthTenantId): ResultAsync<string[], AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(this.queryRoleKeys(userId, tenantId), mapAuthRoleRepositoryError);
  }

  resolveEffectiveAccess(
    userId: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<EffectiveAuthAccess, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(this.queryEffectiveAccess(userId, tenantId), mapAuthRoleRepositoryError);
  }

  // Idempotently reconcile the user's role assignments to exactly the requested
  // role keys that resolve to a seeded role in the tenant: insert the missing
  // ones and delete the removed ones inside a single transaction. Returns the
  // role keys that were actually assigned (i.e. resolved to a real role row).
  private async reconcileAssignments(input: AssignAuthUserRolesInput): Promise<string[]> {
    const tenantId = input.tenantId ?? DefaultAuthTenantId;
    const desiredKeys = [...new Set(input.roleKeys)];

    return this.entityManager.transactional(async (em) => {
      const roles =
        desiredKeys.length === 0
          ? []
          : await em.find(AuthRoleEntity, {
              tenantId,
              key: { $in: desiredKeys },
            });
      const desiredRoleIds = new Set(roles.map((role) => role.id));

      const existing = await em.find(AuthUserRoleEntity, {
        userId: input.userId,
        tenantId,
      });
      const existingRoleIds = new Set(existing.map((row) => row.roleId));

      for (const role of roles) {
        if (!existingRoleIds.has(role.id)) {
          em.persist(
            new AuthUserRoleEntity({
              userId: input.userId,
              roleId: role.id,
              tenantId,
              grantedByUserId: input.grantedByUserId ?? null,
            }),
          );
        }
      }

      const removedRoleIds = existing.map((row) => row.roleId).filter((roleId) => !desiredRoleIds.has(roleId));
      if (removedRoleIds.length > 0) {
        await em.nativeDelete(AuthUserRoleEntity, {
          userId: input.userId,
          tenantId,
          roleId: { $in: removedRoleIds },
        });
      }

      await em.flush();
      return roles.map((role) => role.key);
    });
  }

  private async queryRoleKeys(userId: string, tenantId: string): Promise<string[]> {
    const rows = (await this.entityManager
      .getConnection()
      .execute(listRoleKeysSql, [userId, tenantId], 'all')) as RoleKeyRow[];

    return distinctText(rows.map((row) => row.role_key));
  }

  private async queryEffectiveAccess(userId: string, tenantId: string): Promise<EffectiveAuthAccess> {
    const rows = (await this.entityManager
      .getConnection()
      .execute(resolveEffectiveAccessSql, [userId, tenantId, userId, tenantId], 'all')) as EffectiveAccessRow[];

    return {
      roleKeys: distinctText(rows.map((row) => row.role_key)),
      permissionKeys: distinctText(rows.map((row) => row.permission_key)),
    };
  }
}

function distinctText(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
