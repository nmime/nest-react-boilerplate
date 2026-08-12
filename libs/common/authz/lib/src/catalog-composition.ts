import type { PermissionDefinition } from './types';

/** Extra permissions a product grants to one role. The role may be a base role or a new one. */
export interface AuthzRoleGrant {
  readonly role: string;
  readonly permissions: readonly string[];
}

/**
 * One product's additions to the shared RBAC catalog. Products register these instead of editing
 * the base catalog, so a boilerplate upgrade never conflicts with product permissions.
 */
export interface AuthzExtension {
  /** Used in error messages so a misconfiguration names the extension that caused it. */
  readonly id: string;
  readonly permissions?: readonly PermissionDefinition[];
  readonly grants?: readonly AuthzRoleGrant[];
}

export interface AuthzCatalogInput {
  readonly permissions: readonly PermissionDefinition[];
  readonly grants: Readonly<Record<string, readonly string[]>>;
  readonly extensions: readonly AuthzExtension[];
}

export interface ComposedAuthzCatalog {
  readonly permissions: readonly PermissionDefinition[];
  readonly roles: readonly string[];
  readonly rolePermissions: Readonly<Record<string, readonly string[]>>;
  readonly permissionsForRoles: (roles: readonly string[]) => string[];
}

/**
 * Folds every extension's permissions into the base list, tracking who defined each key so the
 * grant pass below can reject an undeclared one and so a redefinition names both parties.
 */
const composePermissions = (
  permissions: readonly PermissionDefinition[],
  extensions: readonly AuthzExtension[],
): { composedPermissions: PermissionDefinition[]; definedBy: Map<string, string> } => {
  const composedPermissions = [...permissions];
  const definedBy = new Map<string, string>(permissions.map((entry) => [entry.key, 'the base catalog']));

  for (const extension of extensions) {
    for (const permission of extension.permissions ?? []) {
      if (permission.resource === '') {
        throw new Error(`authz extension "${extension.id}" defines permission "${permission.key}" without a resource`);
      }
      if (permission.action === '') {
        throw new Error(`authz extension "${extension.id}" defines permission "${permission.key}" without an action`);
      }
      if (definedBy.has(permission.key)) {
        throw new Error(`authz extension "${extension.id}" redefines permission "${permission.key}"`);
      }

      definedBy.set(permission.key, extension.id);
      composedPermissions.push(permission);
    }
  }

  return { composedPermissions, definedBy };
};

/**
 * Folds every extension's grants into the base matrix. A grant may name a role the base matrix
 * never declared — that is how a product adds a role — but never a permission no catalog defines.
 */
const composeRolePermissions = (
  grants: Readonly<Record<string, readonly string[]>>,
  extensions: readonly AuthzExtension[],
  definedBy: ReadonlyMap<string, string>,
): Map<string, string[]> => {
  const rolePermissions = new Map<string, string[]>(
    Object.entries(grants).map(([role, granted]) => [role, [...granted]]),
  );

  for (const extension of extensions) {
    for (const grant of extension.grants ?? []) {
      const merged = new Set(rolePermissions.get(grant.role) ?? []);

      for (const permission of grant.permissions) {
        if (!definedBy.has(permission)) {
          throw new Error(
            `authz extension "${extension.id}" grants unknown permission "${permission}" to role "${grant.role}"`,
          );
        }

        merged.add(permission);
      }

      rolePermissions.set(grant.role, [...merged]);
    }
  }

  return rolePermissions;
};

/**
 * Folds product extensions into the base catalog. Every failure mode here is a configuration
 * mistake that would otherwise surface as a silently powerless principal at request time, so each
 * one throws at composition (module load) instead: a permission may not be redefined, and a role
 * may not be granted a permission no catalog declares.
 */
export const composeAuthzCatalog = ({ permissions, grants, extensions }: AuthzCatalogInput): ComposedAuthzCatalog => {
  const { composedPermissions, definedBy } = composePermissions(permissions, extensions);
  const rolePermissions = composeRolePermissions(grants, extensions, definedBy);
  const resolved = Object.fromEntries(rolePermissions);

  return {
    permissions: composedPermissions,
    roles: [...rolePermissions.keys()],
    rolePermissions: resolved,
    // Unknown roles contribute nothing (fail closed), exactly as the base matrix does.
    permissionsForRoles: (roles) => [...new Set(roles.flatMap((role) => resolved[role] ?? []))],
  };
};
