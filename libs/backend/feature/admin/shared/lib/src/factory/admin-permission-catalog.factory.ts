import {
  AdminRole,
  UserRole,
  UserProfileReadPermission,
  defaultRolePermissions,
  permissionCatalog,
} from '@app/common-authz';
import type { AdminAction, AdminSubject } from '../type/admin-permission.type';

// The admin-scoped catalog is the subset of the shared catalog granted to the
// admin role (everything except the user-scoped `profile:read`), sourced from
// the shared definitions so resource/action metadata never drifts.
const adminPermissionKeys = new Set<string>(defaultRolePermissions[AdminRole]);

export const adminPermissionCatalog = permissionCatalog
  .filter((entry) => adminPermissionKeys.has(entry.key))
  .map((entry) => ({
    permission: entry.key,
    // Resource and action are cast for CASL's benefit: the shared catalog is open to product
    // permissions, whose resource/action pairs are outside the boilerplate's own unions. CASL
    // compares them as plain strings at runtime, so an unlisted pair authorizes correctly.
    resource: entry.resource as AdminSubject,
    action: entry.action as AdminAction,
    description: entry.description,
  }));

export const adminRolePermissionMatrix = defaultRolePermissions;

export const adminRoleCatalog = [
  {
    role: UserRole,
    label: 'User',
    description: 'Baseline application user role.',
    permissions: [...adminRolePermissionMatrix[UserRole]],
  },
  {
    role: AdminRole,
    label: 'Administrator',
    description: 'Back-office administrator with explicit granular grants.',
    permissions: [...adminRolePermissionMatrix[AdminRole]],
  },
] as const;

export const adminAssignableRoles = adminRoleCatalog.map((item) => item.role);
export const adminAssignablePermissions = [
  UserProfileReadPermission,
  ...adminPermissionCatalog.map((item) => item.permission),
] as const;
