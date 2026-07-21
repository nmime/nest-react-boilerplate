export interface AdminAuditLogView {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId?: string;
  readonly action: string;
  readonly resource: string;
  readonly targetUserId?: string;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
}
