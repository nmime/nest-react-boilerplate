import { EntityManager } from "@mikro-orm/core";
import { Inject, Injectable } from "@nestjs/common";
import { ResultAsync } from "neverthrow";
import {
  AuthPermissionEntity,
  AuthRoleEntity,
  AuthRolePermissionEntity,
  DefaultAuthTenantId,
} from "../entities";
import { mapAuthRoleRepositoryError } from "./mapper/auth-role-error.mapper";
import type {
  AuthRoleRepositoryError,
  AuthRoleWithPermissions,
  CreateAuthRoleInput,
  UpdateAuthRoleInput,
} from "./type/auth-role.type";

export * from "./mapper/auth-role-error.mapper";
export * from "./type/auth-role.type";

@Injectable()
export class AuthRoleRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  findByKey(
    key: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthRoleEntity | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthRoleEntity, { tenantId, key }),
      mapAuthRoleRepositoryError,
    );
  }

  findByKeys(
    keys: readonly string[],
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthRoleEntity[], AuthRoleRepositoryError> {
    const distinctKeys = [...new Set(keys)];
    if (distinctKeys.length === 0) {
      return ResultAsync.fromSafePromise(Promise.resolve([]));
    }

    return ResultAsync.fromPromise(
      this.entityManager.find(AuthRoleEntity, {
        tenantId,
        key: { $in: distinctKeys },
      }),
      mapAuthRoleRepositoryError,
    );
  }

  findById(
    id: string,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthRoleEntity | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.entityManager.findOne(AuthRoleEntity, { id, tenantId }),
      mapAuthRoleRepositoryError,
    );
  }

  // Every permission the shared catalog was seeded with, sourced from the DB so
  // the admin roles view never re-hardcodes the catalog.
  listPermissions(): ResultAsync<
    AuthPermissionEntity[],
    AuthRoleRepositoryError
  > {
    return ResultAsync.fromPromise(
      this.entityManager.find(AuthPermissionEntity, {}),
      mapAuthRoleRepositoryError,
    );
  }

  // List every role in a tenant together with the permission keys granted to it
  // through `auth_role_permissions -> auth_permissions`.
  listRolesWithPermissions(
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthRoleWithPermissions[], AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.queryRolesWithPermissions(tenantId),
      mapAuthRoleRepositoryError,
    );
  }

  createRole(
    input: CreateAuthRoleInput,
  ): ResultAsync<AuthRoleEntity, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.persistNewRole(input),
      mapAuthRoleRepositoryError,
    );
  }

  updateRole(
    id: string,
    input: UpdateAuthRoleInput,
    tenantId: string = DefaultAuthTenantId,
  ): ResultAsync<AuthRoleEntity | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.applyRoleUpdate(id, input, tenantId),
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
  ): ResultAsync<AuthRoleWithPermissions | null, AuthRoleRepositoryError> {
    return ResultAsync.fromPromise(
      this.reconcileRolePermissions(id, permissionKeys, tenantId),
      mapAuthRoleRepositoryError,
    );
  }

  private async queryRolesWithPermissions(
    tenantId: string,
  ): Promise<AuthRoleWithPermissions[]> {
    const roles = await this.entityManager.find(
      AuthRoleEntity,
      { tenantId },
      { orderBy: { key: "asc" } },
    );
    if (roles.length === 0) {
      return [];
    }

    const roleIds = roles.map((role) => role.id);
    const rolePermissions = await this.entityManager.find(
      AuthRolePermissionEntity,
      { roleId: { $in: roleIds } },
    );
    const permissionIds = [
      ...new Set(rolePermissions.map((row) => row.permissionId)),
    ];
    const permissions =
      permissionIds.length === 0
        ? []
        : await this.entityManager.find(AuthPermissionEntity, {
            id: { $in: permissionIds },
          });
    const permissionKeyById = new Map(
      permissions.map((permission) => [permission.id, permission.key]),
    );
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

  private async persistNewRole(
    input: CreateAuthRoleInput,
  ): Promise<AuthRoleEntity> {
    const role = new AuthRoleEntity({
      tenantId: input.tenantId ?? DefaultAuthTenantId,
      key: input.key,
      label: input.label,
      description: input.description,
      isSystem: input.isSystem ?? false,
    });
    this.entityManager.persist(role);
    await this.entityManager.flush();

    return role;
  }

  private async applyRoleUpdate(
    id: string,
    input: UpdateAuthRoleInput,
    tenantId: string,
  ): Promise<AuthRoleEntity | null> {
    const role = await this.entityManager.findOne(AuthRoleEntity, {
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
    await this.entityManager.flush();

    return role;
  }

  private async reconcileRolePermissions(
    id: string,
    permissionKeys: readonly string[],
    tenantId: string,
  ): Promise<AuthRoleWithPermissions | null> {
    const distinctKeys = [...new Set(permissionKeys)];

    return this.entityManager.transactional(async (em) => {
      const role = await em.findOne(AuthRoleEntity, { id, tenantId });
      if (!role) {
        return null;
      }

      const permissions =
        distinctKeys.length === 0
          ? []
          : await em.find(AuthPermissionEntity, {
              key: { $in: distinctKeys },
            });
      const desiredPermissionIds = new Set(
        permissions.map((permission) => permission.id),
      );

      const existing = await em.find(AuthRolePermissionEntity, {
        roleId: role.id,
      });
      const existingPermissionIds = new Set(
        existing.map((row) => row.permissionId),
      );

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
      await em.flush();

      return {
        role,
        permissionKeys: permissions.map((permission) => permission.key),
      };
    });
  }
}
