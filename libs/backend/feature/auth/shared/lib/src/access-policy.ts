import { normalizeStringList } from "@app/backend-common-shared";
import {
  AdminRole,
  UserRole,
  permissionCatalog,
  permissionsForRoles,
  roleKeys as systemRoleKeys,
} from "@app/common-authz";
import { DefaultAuthTenantId } from "./oauth";

// Re-export the shared permission and role identifiers so existing importers of
// @app/backend-feature-auth-shared keep resolving them from this module.
export {
  UserRole,
  AdminRole,
  permissionsForRoles,
  UserProfileReadPermission,
  AdminProfileReadPermission,
  AdminDashboardReadPermission,
  AdminUsersReadPermission,
  AdminUsersWritePermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminAuditReadPermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminManageAllPermission,
} from "@app/common-authz";

export interface AuthAccessPolicy {
  roles: string[];
  permissions: string[];
}

// Resolve the bootstrap ROLE keys a freshly created account should receive.
// Everyone gets `user`; bootstrap-allowlisted admins additionally get `admin`.
// This is the preferred entry point: callers assign these roles to the
// normalized RBAC tables and let the effective-permission resolver derive the
// permission set, instead of persisting hardcoded permission arrays.
export function resolveBootstrapRoleKeys(
  email: string,
  env: Record<string, string | undefined> = process.env,
  tenantId = DefaultAuthTenantId,
): string[] {
  const normalizedEmail = email.trim().toLowerCase();
  const isAdmin = isAdminBootstrapAllowed(normalizedEmail, tenantId, env);

  return isAdmin ? [UserRole, AdminRole] : [UserRole];
}

export function createDefaultAccessPolicy(
  email: string,
  env: Record<string, string | undefined> = process.env,
  tenantId = DefaultAuthTenantId,
): AuthAccessPolicy {
  const roles = resolveBootstrapRoleKeys(email, env, tenantId);

  return {
    roles,
    permissions: permissionsForRoles(roles),
  };
}

const roleKeyOrder = new Map<string, number>(
  systemRoleKeys.map((key, index) => [key, index]),
);
const permissionKeyOrder = new Map<string, number>(
  permissionCatalog.map((permission, index) => [permission.key, index]),
);

// Canonical, deterministic ordering so the arrays resolved from the normalized
// RBAC tables (whose rows come back in arbitrary order) match, byte for byte,
// what `createDefaultAccessPolicy`/`permissionsForRoles` produce. Known keys
// sort by their catalog index; any unknown keys are appended alphabetically so
// the result stays stable regardless of insertion order.
export function orderRoleKeys(keys: readonly string[]): string[] {
  return orderByCatalog(keys, roleKeyOrder);
}

export function orderPermissionKeys(keys: readonly string[]): string[] {
  return orderByCatalog(keys, permissionKeyOrder);
}

function orderByCatalog(
  keys: readonly string[],
  order: ReadonlyMap<string, number>,
): string[] {
  return [...new Set(keys)].sort((left, right) => {
    const leftIndex = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex === rightIndex
      ? left.localeCompare(right)
      : leftIndex - rightIndex;
  });
}

export function isAdminBootstrapAllowed(
  normalizedEmail: string,
  tenantId = DefaultAuthTenantId,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.ADMIN_BOOTSTRAP_ENABLED !== "true") {
    return false;
  }

  const adminBootstrapEmails = normalizeStringList(
    env.ADMIN_BOOTSTRAP_EMAILS,
  ).map((item) => item.toLowerCase());
  if (!adminBootstrapEmails.includes(normalizedEmail)) {
    return false;
  }

  const allowedTenantIds = normalizeStringList(env.ADMIN_BOOTSTRAP_TENANT_IDS);
  return (
    tenantId === DefaultAuthTenantId || allowedTenantIds.includes(tenantId)
  );
}
