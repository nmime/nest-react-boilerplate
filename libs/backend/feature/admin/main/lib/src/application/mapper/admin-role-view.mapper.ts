import type { AuthRoleWithPermissions } from '@app/backend-postgres-main-auth';
import type { AdminRoleView } from '../../domain';
import { orderPermissionKeys } from '../util';

export const toAdminRoleView = (entry: AuthRoleWithPermissions): AdminRoleView => ({
  id: entry.role.id,
  role: entry.role.key,
  label: entry.role.label,
  description: entry.role.description,
  isSystem: entry.role.isSystem,
  permissions: orderPermissionKeys(entry.permissionKeys),
});
