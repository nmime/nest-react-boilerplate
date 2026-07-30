import type { AdminAuditLogRecord } from '@app/backend-feature-auth-shared';
import type { AdminAuditLogView } from '../../domain';

export const toAdminAuditLogView = (entity: AdminAuditLogRecord): AdminAuditLogView => ({
  id: entity.id,
  tenantId: entity.tenantId,
  ...(entity.actorUserId ? { actorUserId: entity.actorUserId } : {}),
  action: entity.action,
  resource: entity.resource,
  ...(entity.targetUserId ? { targetUserId: entity.targetUserId } : {}),
  before: entity.before,
  after: entity.after,
  metadata: entity.metadata,
  createdAt: entity.createdAt.toISOString(),
});
