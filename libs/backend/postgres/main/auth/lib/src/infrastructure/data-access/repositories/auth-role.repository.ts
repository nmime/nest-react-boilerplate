import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import {
  AuthPermissionEntity,
  AuthRoleEntity,
  AuthRolePermissionEntity,
  AuthUserEntity,
  AuthUserRoleEntity,
  DefaultAuthTenantId,
} from '../entities';
import { mapAuthRoleRepositoryError } from './mapper/auth-role-error.mapper';
import type {
  AuthRoleRepositoryError,
  AuthRoleWithPermissions,
  CreateAuthRoleInput,
  UpdateAuthRoleInput,
} from './type/auth-role.type';
import { applyAccessPolicy } from './util/access-policy.util';
import { countActivePowerfulAdmins, hasActivePowerfulAdminAccess } from './util/powerful-admin-access.util';
import { resolveEffectiveAccess } from './util/reconcile-user-roles.util';

export * from './mapper/auth-role-error.mapper';
export * from './type/auth-role.type';

@Injectable()
export class AuthRoleRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  findByKey(
    key: string,
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthRoleEntity | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      entityManager.findOne(AuthRoleEntity, { tenantId, key }),
      mapAuthRoleRepositoryError,
    );
  }

  findByKeys(
    keys: readonly string[],
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthRoleEntity[], AuthRoleRepositoryError> {
    const distinctKeys = [...new Set(keys)];
    if (distinctKeys.length === 0) {
      return ResultAsync.fromSafePromise(Promise.resolve([]));
    }

    return ResultAsync.fromPromise(
      entityManager.find(AuthRoleEntity, {
        tenantId,
        key: { $in: distinctKeys },
      }),
      mapAuthRoleRepositoryError,
    );
  }

  findById(
    id: string,
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthRoleEntity | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(entityManager.findOne(AuthRoleEntity, { id, tenantId }), mapAuthRoleRepositoryError);
  }

  // Every permission the shared catalog was seeded with, sourced from the DB so
  // the admin roles view never re-hardcodes the catalog.
  listPermissions(
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthPermissionEntity[], AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(entityManager.find(AuthPermissionEntity, {}), mapAuthRoleRepositoryError);
  }

  findPermissionsByKeys(
    keys: readonly string[],
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthPermissionEntity[], AuthRoleRepositoryError> {
    const distinctKeys = [...new Set(keys)];
    if (distinctKeys.length === 0) {
      return ResultAsync.fromSafePromise(Promise.resolve([]));
    }

    return ResultAsync.fromPromise(
      entityManager.find(AuthPermissionEntity, { key: { $in: distinctKeys } }),
      mapAuthRoleRepositoryError,
    );
  }

  // List every role in a tenant together with the permission keys granted to it
  // through `auth_role_permissions -> auth_permissions`.
  listRolesWithPermissions(
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthRoleWithPermissions[], AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(this.queryRolesWithPermissions(tenantId, entityManager), mapAuthRoleRepositoryError);
  }

  createRole(
    input: CreateAuthRoleInput,
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthRoleEntity, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(this.persistNewRole(input, entityManager), mapAuthRoleRepositoryError);
  }

  updateRole(
    id: string,
    input: UpdateAuthRoleInput,
    tenantId: string = DefaultAuthTenantId,
    entityManager: EntityManager = this.entityManager,
  ): ResultAsync<AuthRoleEntity | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.applyRoleUpdate(id, input, tenantId, entityManager),
      mapAuthRoleRepositoryError,
    );
  }

  // Reconcile a role's permission grants to exactly `permissionKeys` that resolve
  // to a seeded permission: insert the missing rows and delete the removed ones
  // inside a single transaction. Returns the resolved permission keys.
  setRolePermissions(
    id: string,
    permissionKeys: readonly string[],
    tenantId: string = DefaultAuthTenantId,
    actorUserId?: string,
    entityManager?: EntityManager,
  ): ResultAsync<AuthRoleWithPermissions | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      entityManager
        ? this.applyRolePermissionSet(entityManager, id, permissionKeys, tenantId, actorUserId)
        : this.entityManager.transactional((em) =>
            this.applyRolePermissionSet(em, id, permissionKeys, tenantId, actorUserId),
          ),
      mapAuthRoleRepositoryError,
    );
  }

  private async queryRolesWithPermissions(
    tenantId: string,
    entityManager: EntityManager,
  ): Promise<AuthRoleWithPermissions[]> {
    const roles = await entityManager.find(AuthRoleEntity, { tenantId }, { orderBy: { key: 'asc' } });
    if (roles.length === 0) {
      return [];
    }

    const roleIds = roles.map((role) => role.id);
    const rolePermissions = await entityManager.find(AuthRolePermissionEntity, { roleId: { $in: roleIds } });
    const permissionIds = [...new Set(rolePermissions.map((row) => row.permissionId))];
    const permissions =
      permissionIds.length === 0
        ? []
        : await entityManager.find(AuthPermissionEntity, {
            id: { $in: permissionIds },
          });
    const permissionKeyById = new Map(permissions.map((permission) => [permission.id, permission.key]));
    const keysByRoleId = new Map<string, string[]>();
    for (const row of rolePermissions) {
      const key = permissionKeyById.get(row.permissionId);
      if (!key) {
        continue;
      }
      const bucket = keysByRoleId.get(row.roleId) ?? [];
      bucket.push(key);
      keysByRoleId.set(row.roleId, bucket);
    }

    return roles.map((role) => ({
      role,
      permissionKeys: keysByRoleId.get(role.id) ?? [],
    }));
  }

  private async persistNewRole(input: CreateAuthRoleInput, entityManager: EntityManager): Promise<AuthRoleEntity> {
    const role = new AuthRoleEntity({
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      key: input.key,
      label: input.label,
      description: input.description,
      isSystem: input.isSystem ?? false,
    });
    entityManager.persist(role);
    await entityManager.flush();

    return role;
  }

  private async applyRoleUpdate(
    id: string,
    input: UpdateAuthRoleInput,
    tenantId: string,
    entityManager: EntityManager,
  ): Promise<AuthRoleEntity | null> {
    const role = await entityManager.findOne(AuthRoleEntity, {
      id,
      tenantId,
    });
    if (!role) {
      return null;
    }
    if (input.label !== undefined) {
      role.label = input.label;
    }
    if (input.description !== undefined) {
      role.description = input.description;
    }
    await entityManager.flush();

    return role;
  }

  private async applyRolePermissionSet(
    em: EntityManager,
    id: string,
    permissionKeys: readonly string[],
    tenantId: string,
    actorUserId?: string,
  ): Promise<AuthRoleWithPermissions | null> {
    const distinctKeys = [...new Set(permissionKeys)];
    const role = await em.findOne(AuthRoleEntity, { id, tenantId });
    if (!role) {
      return null;
    }

    const actorBefore = await this.findUserWithAccess(em, actorUserId, tenantId);
    const actorHadPowerfulAccess = actorBefore ? hasActivePowerfulAdminAccess(actorBefore) : false;

    const permissions =
      distinctKeys.length === 0
        ? []
        : await em.find(AuthPermissionEntity, {
            key: { $in: distinctKeys },
          });
    const desiredPermissionIds = new Set(permissions.map((permission) => permission.id));

    const existing = await em.find(AuthRolePermissionEntity, {
      roleId: role.id,
    });
    const existingPermissionIds = new Set(existing.map((row) => row.permissionId));

    for (const permission of permissions) {
      if (!existingPermissionIds.has(permission.id)) {
        em.persist(
          new AuthRolePermissionEntity({
            roleId: role.id,
            permissionId: permission.id,
          }),
        );
      }
    }

    const removedPermissionIds = existing
      .map((row) => row.permissionId)
      .filter((permissionId) => !desiredPermissionIds.has(permissionId));
    if (removedPermissionIds.length > 0) {
      await em.nativeDelete(AuthRolePermissionEntity, {
        roleId: role.id,
        permissionId: { $in: removedPermissionIds },
      });
    }

    // Bump updatedAt so the role's revision reflects the grant change.
    role.updatedAt = new Date();
    // Ensure the following effective-access reads see inserts and deletes even
    // when the ORM is configured with commit-only flushing.
    await em.flush();
    await this.rehydrateRoleMemberAccess(em, role.id, tenantId);
    await em.flush();

    await this.assertPowerfulAdminSafety(em, actorUserId, tenantId, actorHadPowerfulAccess);

    return {
      role,
      permissionKeys: permissions.map((permission) => permission.key),
    };
  }

  private async findUserWithAccess(
    em: EntityManager,
    userId: string | undefined,
    tenantId: string,
  ): Promise<AuthUserEntity | null> {
    if (!userId) {
      return null;
    }
    const user = await em.findOne(AuthUserEntity, { id: userId, tenantId });
    if (user) {
      applyAccessPolicy(user, await awaitAccessPolicy(em, tenantId, user.id));
    }
    return user;
  }

  private async assertPowerfulAdminSafety(
    em: EntityManager,
    actorUserId: string | undefined,
    tenantId: string,
    actorHadPowerfulAccess: boolean,
  ): Promise<void> {
    if (!actorUserId) {
      return;
    }
    const actorAfter = await this.findUserWithAccess(em, actorUserId, tenantId);
    if (actorHadPowerfulAccess && (!actorAfter || !hasActivePowerfulAdminAccess(actorAfter))) {
      throw new Error('Administrators cannot remove their own active admin write access.');
    }
    if ((await countActivePowerfulAdmins(em, tenantId)) === 0) {
      throw new Error('At least one active administrator must retain admin write access.');
    }
  }

  // Permission changes can affect every member of the role. Refresh the
  // in-transaction domain projections used by safety checks and return values.
  private async rehydrateRoleMemberAccess(em: EntityManager, roleId: string, tenantId: string): Promise<void> {
    const assignments = await em.find(AuthUserRoleEntity, { roleId, tenantId });
    const userIds = [
      ...new Set(
        assignments.map((assignment) => assignment.userId).filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    if (userIds.length === 0) {
      return;
    }

    const users = await em.find(AuthUserEntity, { id: { $in: userIds }, tenantId });
    const accesses = await Promise.all(
      users.map(async (user) => ({
        user,
        access: await resolveEffectiveAccess(em, tenantId, user.id),
      })),
    );
    for (const { user, access } of accesses) {
      applyAccessPolicy(user, {
        roles: access.roleKeys,
        permissions: access.permissionKeys,
      });
    }
  }
}

async function awaitAccessPolicy(em: EntityManager, tenantId: string, userId: string) {
  const access = await resolveEffectiveAccess(em, tenantId, userId);
  return { roles: access.roleKeys, permissions: access.permissionKeys };
}
