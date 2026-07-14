import type { AdminUserStatus } from './admin-user.type';

export interface UpdateAdminUserStatusCommand {
  readonly status: AdminUserStatus;
}

export interface UpdateAdminUserAccessPolicyCommand {
  readonly roles: string[];
  readonly permissions: string[];
}

export interface AssignAdminUserRolesCommand {
  readonly roles: string[];
}

export interface CreateAdminRoleCommand {
  readonly key: string;
  readonly label?: string;
  readonly description?: string;
  readonly permissions?: string[];
}

export interface UpdateAdminRoleCommand {
  readonly label?: string;
  readonly description?: string;
}

export interface SetAdminRolePermissionsCommand {
  readonly permissions: string[];
}
