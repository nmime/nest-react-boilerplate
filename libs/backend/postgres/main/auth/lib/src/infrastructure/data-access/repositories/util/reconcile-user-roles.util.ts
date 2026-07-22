import type { EntityManager } from '@mikro-orm/core';
import { permissionCatalog, roleKeys as systemRoleKeys } from '@app/common-authz';
import {
  AuthPermissionEntity,
  AuthRoleEntity,
  AuthRolePermissionEntity,
  AuthUserPermissionEntity,
  AuthUserRoleEntity,
} from '../../entities';

// Insert the missing (user, role) rows and delete the removed ones so the
// user's normalized assignments match exactly the desired role keys that resolve
// to a seeded role in the tenant. Runs on the caller's transactional manager.
export async function reconcileUserRoles(
  em: EntityManager,
  tenantId: string,
  userId: string,
  actorUserId: string,
  desiredRoleKeys: readonly string[],
): Promise<void> {
  const distinctKeys = [...new Set(desiredRoleKeys)];
  const roles =
    distinctKeys.length === 0 ? [] : await em.find(AuthRoleEntity, { tenantId, key: { $in: distinctKeys } });
  const desiredRoleIds = new Set(roles.map((role) => role.id));

  const existing = await em.find(AuthUserRoleEntity, { userId, tenantId });
  const existingRoleIds = new Set(existing.map((row) => row.roleId));

  for (const role of roles) {
    if (!existingRoleIds.has(role.id)) {
      em.persist(
        new AuthUserRoleEntity({
          userId,
          roleId: role.id,
          tenantId,
          grantedByUserId: actorUserId,
        }),
      );
    }
  }

  const removedRoleIds = existing.map((row) => row.roleId).filter((roleId) => !desiredRoleIds.has(roleId));
  if (removedRoleIds.length > 0) {
    await em.nativeDelete(AuthUserRoleEntity, {
      userId,
      tenantId,
      roleId: { $in: removedRoleIds },
    });
  }
}

// Reconcile only the user's direct grants. Effective access is always the
// union of these rows and the grants inherited from `auth_user_roles`.
export async function reconcileUserDirectPermissions(
  em: EntityManager,
  tenantId: string,
  userId: string,
  actorUserId: string,
  desiredPermissionKeys: readonly string[],
): Promise<void> {
  const distinctKeys = [...new Set(desiredPermissionKeys)];
  const permissions =
    distinctKeys.length === 0 ? [] : await em.find(AuthPermissionEntity, { key: { $in: distinctKeys } });
  const desiredPermissionIds = new Set(permissions.map((permission) => permission.id));
  const existing = await em.find(AuthUserPermissionEntity, { userId, tenantId });
  const existingPermissionIds = new Set(existing.map((row) => row.permissionId));

  for (const permission of permissions) {
    if (!existingPermissionIds.has(permission.id)) {
      em.persist(
        new AuthUserPermissionEntity({
          userId,
          permissionId: permission.id,
          tenantId,
          grantedByUserId: actorUserId,
        }),
      );
    }
  }

  const removedPermissionIds = existing
    .map((row) => row.permissionId)
    .filter((permissionId) => !desiredPermissionIds.has(permissionId));
  if (removedPermissionIds.length > 0) {
    await em.nativeDelete(AuthUserPermissionEntity, {
      userId,
      tenantId,
      permissionId: { $in: removedPermissionIds },
    });
  }
}

// Resolve the canonical effective {roleKeys, permissionKeys} for a user from the
// normalized RBAC join, ordered by catalog index so returned projections stay
// byte-for-byte identical to what the shared matrix produces.
export async function resolveEffectiveAccess(
  em: EntityManager,
  tenantId: string,
  userId: string,
): Promise<{ roleKeys: string[]; permissionKeys: string[] }> {
  const assignments = await em.find(AuthUserRoleEntity, { userId, tenantId });
  const roleIds = [...new Set(assignments.map((row) => row.roleId))];
  const roles = roleIds.length === 0 ? [] : await em.find(AuthRoleEntity, { id: { $in: roleIds }, tenantId });
  const inheritedPermissionKeys = await resolveRolePermissionKeys(
    em,
    roles.map((role) => role.id),
  );
  const directAssignments = await em.find(AuthUserPermissionEntity, { userId, tenantId });
  const directPermissionIds = directAssignments.map((row) => row.permissionId);
  const permissionIds = [...new Set([...inheritedPermissionKeys.ids, ...directPermissionIds])];
  const permissions =
    permissionIds.length === 0 ? [] : await em.find(AuthPermissionEntity, { id: { $in: permissionIds } });

  return {
    roleKeys: orderByCatalog(
      roles.map((role) => role.key),
      roleKeyOrder,
    ),
    permissionKeys: orderByCatalog(
      permissions.map((permission) => permission.key),
      permissionKeyOrder,
    ),
  };
}

export async function resolveInheritedPermissionKeys(
  em: EntityManager,
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const assignments = await em.find(AuthUserRoleEntity, { userId, tenantId });
  const roleIds = [...new Set(assignments.map((row) => row.roleId))];
  const roles = roleIds.length === 0 ? [] : await em.find(AuthRoleEntity, { id: { $in: roleIds }, tenantId });
  const inherited = await resolveRolePermissionKeys(
    em,
    roles.map((role) => role.id),
  );
  const permissions =
    inherited.ids.length === 0 ? [] : await em.find(AuthPermissionEntity, { id: { $in: inherited.ids } });

  return orderByCatalog(
    permissions.map((permission) => permission.key),
    permissionKeyOrder,
  );
}

async function resolveRolePermissionKeys(em: EntityManager, roleIds: readonly string[]): Promise<{ ids: string[] }> {
  const rolePermissions =
    roleIds.length === 0 ? [] : await em.find(AuthRolePermissionEntity, { roleId: { $in: roleIds } });

  return { ids: [...new Set(rolePermissions.map((row) => row.permissionId))] };
}

const roleKeyOrder = new Map<string, number>(systemRoleKeys.map((key, index) => [key, index]));
const permissionKeyOrder = new Map<string, number>(
  permissionCatalog.map((permission, index) => [permission.key, index]),
);

function orderByCatalog(keys: readonly string[], order: ReadonlyMap<string, number>): string[] {
  return [...new Set(keys)].sort((left, right) => {
    const leftIndex = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex === rightIndex ? left.localeCompare(right) : leftIndex - rightIndex;
  });
}
