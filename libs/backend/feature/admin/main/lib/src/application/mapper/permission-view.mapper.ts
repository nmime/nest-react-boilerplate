import type { AuthPermissionRecord } from '@app/backend-feature-auth-shared';
import type { AdminRolePermissionView } from '../../domain';

export const toPermissionView = (entity: AuthPermissionRecord): AdminRolePermissionView => ({
  permission: entity.key,
  resource: entity.resource,
  action: entity.action,
  description: entity.description,
});
