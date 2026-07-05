import {
  AdminRole,
  UserRole,
  UserProfileReadPermission,
  defaultRolePermissions,
  permissionCatalog,
} from "@app/common-authz";
import type { AdminSubject } from "../type/admin-permission.type";

// The admin-scoped catalog is the subset of the shared catalog granted to the
// admin role (everything except the user-scoped `profile:read`), sourced from
// the shared definitions so resource/action metadata never drifts.
const adminPermissionKeys = new Set<string>(defaultRolePermissions[AdminRole]);

export const adminPermissionCatalog = permissionCatalog
  .filter((entry) => adminPermissionKeys.has(entry.key))
  .map((entry) => ({
    permission: entry.key,
    resource: entry.resource as AdminSubject,
    action: entry.action,
    description: entry.description,
  }));

export const adminRolePermissionMatrix = defaultRolePermissions;

export const adminRoleCatalog = [
  {
    role: UserRole,
    label: "User",
    description: "Baseline application user role.",
    permissions: [...adminRolePermissionMatrix[UserRole]],
  },
  {
    role: AdminRole,
    label: "Administrator",
    description: "Back-office administrator with explicit granular grants.",
    permissions: [...adminRolePermissionMatrix[AdminRole]],
  },
] as const;

export const adminAssignableRoles = adminRoleCatalog.map((item) => item.role);
export const adminAssignablePermissions = [
  UserProfileReadPermission,
  ...adminPermissionCatalog.map((item) => item.permission),
] as const;
