import type { adminAuditActions } from "../const";
import type { AdminPageQuery } from "./admin-page.type";

export type AdminAuditAction = (typeof adminAuditActions)[number];

export interface AdminAuditQuery extends AdminPageQuery {
  readonly action?: AdminAuditAction;
  readonly actorUserId?: string;
  readonly targetUserId?: string;
}

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

export interface AdminAuditLogListPayload {
  readonly items: AdminAuditLogView[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
