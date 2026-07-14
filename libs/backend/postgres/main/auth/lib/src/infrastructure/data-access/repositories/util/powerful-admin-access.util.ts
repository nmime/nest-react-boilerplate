import type { AuthUserEntity } from '../../entities';
import {
  AdminRoleName,
  AdminUsersAccessPolicyUpdatePermissionName,
  AdminUsersWritePermissionName,
} from '../const/admin-user-mutation.const';

export function hasActivePowerfulAdminAccess(
  entity: Pick<AuthUserEntity, 'status' | 'roles' | 'permissions'>,
): boolean {
  return (
    entity.status === 'active' &&
    entity.roles.includes(AdminRoleName) &&
    entity.permissions.includes(AdminUsersWritePermissionName) &&
    entity.permissions.includes(AdminUsersAccessPolicyUpdatePermissionName)
  );
}
