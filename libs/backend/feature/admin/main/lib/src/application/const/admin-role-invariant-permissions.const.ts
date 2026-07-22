import {
  AdminManageAllPermission,
  AdminRolesWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersWritePermission,
} from '@app/common-authz';

// The system `admin` role must always retain the grants that let administrators
// manage users and roles; stripping any of these would lock the tenant out of
// its own access-control surface.
export const adminRoleInvariantPermissions = [
  AdminUsersWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminRolesWritePermission,
  AdminManageAllPermission,
] as const;
