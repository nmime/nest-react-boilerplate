import type { AdminAuditLogEntityInput, AuthUserEntity } from '../../entities';
import type { AdminUserMutationAction } from '../type/admin-user-mutation.type';

export function auditSnapshotFor(
  action: AdminUserMutationAction,
  entity: AuthUserEntity,
): AdminAuditLogEntityInput['before'] {
  if (action === 'admin.user.status.update') {
    return { status: entity.status };
  }

  return {
    roles: [...entity.roles],
    permissions: [...entity.permissions],
    status: entity.status,
  };
}
