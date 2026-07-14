import type { AuthPermissionEntity } from '@app/backend-postgres-main-auth';
import type { AdminRolePermissionView } from '../../domain';

export const toPermissionView = (entity: AuthPermissionEntity): AdminRolePermissionView => ({
  permission: entity.key,
  resource: entity.resource,
  action: entity.action,
  description: entity.description,
});
