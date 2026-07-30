import type { AuthUserPersistenceRecord } from '@app/backend-feature-auth-shared';
import type { AdminUserView } from '../../domain';

const toIso = (value: Date | undefined | null): string | undefined =>
  value && value.getTime() > 0 ? value.toISOString() : undefined;

export const toAdminUserView = (entity: AuthUserPersistenceRecord): AdminUserView => ({
  id: entity.id,
  tenantId: entity.tenantId,
  email: entity.email ?? '',
  ...(entity.displayName ? { displayName: entity.displayName } : {}),
  status: entity.status,
  roles: entity.roles,
  permissions: entity.permissions,
  locale: entity.locale,
  theme: entity.theme,
  ...(entity.avatarUrl ? { avatarUrl: entity.avatarUrl } : {}),
  ...(entity.avatarStatus !== 'none' ? { avatarStatus: entity.avatarStatus } : {}),
  ...(toIso(entity.lastLoginAt) ? { lastLoginAt: toIso(entity.lastLoginAt) } : {}),
  createdAt: entity.createdAt.toISOString(),
  updatedAt: entity.updatedAt.toISOString(),
});
