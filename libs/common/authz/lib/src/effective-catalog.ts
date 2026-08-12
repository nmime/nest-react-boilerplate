import { composeAuthzCatalog } from './catalog-composition';
import { basePermissionCatalog } from './permission-catalog';
import { productAuthzExtensions } from './product-authz';
import { baseRolePermissions, type RolePermissionMatrix } from './role-matrix';
import type { AbilityTarget, PermissionDefinition } from './types';

// The catalog every runtime actually authorizes against: the boilerplate's own permissions plus
// whatever the product registered. Composition throws here, at module load, if a product redefines
// a permission or grants one that no catalog declares.
const composed = composeAuthzCatalog({
  permissions: basePermissionCatalog,
  grants: baseRolePermissions,
  extensions: productAuthzExtensions,
});

export const permissionCatalog: readonly PermissionDefinition[] = composed.permissions;

export const roleKeys: readonly string[] = composed.roles;

// Base roles are always present because they come from `baseRolePermissions`, which the base
// matrix types as a total record over RoleKey.
export const rolePermissions = composed.rolePermissions as RolePermissionMatrix;

/** Kept as the historical name for the effective matrix; the admin API serves this. */
export const defaultRolePermissions = rolePermissions;

const permissionByKey: ReadonlyMap<string, PermissionDefinition> = new Map(
  composed.permissions.map((entry) => [entry.key, entry]),
);

// Returns a plain boolean rather than a `value is PermissionKey` predicate: product permissions
// are legitimately known without belonging to the boilerplate's compile-time union.
export const isKnownPermission = (value: string): boolean => permissionByKey.has(value);

export const permissionToAbilityTarget = (permission: string): AbilityTarget | undefined => {
  const entry = permissionByKey.get(permission);

  return entry ? { action: entry.action, resource: entry.resource } : undefined;
};

/**
 * De-duplicated union of the effective grants for the given roles, preserving catalog order.
 * Unknown roles contribute nothing (fail closed).
 */
export const permissionsForRoles = (roles: readonly string[]): string[] => composed.permissionsForRoles(roles);
