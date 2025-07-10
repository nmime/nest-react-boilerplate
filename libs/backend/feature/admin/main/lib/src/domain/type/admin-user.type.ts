import type { adminUserStatuses } from "../const";
import type { AdminAuditLogView } from "./admin-audit.type";
import type { AdminPageQuery } from "./admin-page.type";

export type AdminUserStatus = (typeof adminUserStatuses)[number];

export interface AdminUserQuery extends AdminPageQuery {
  readonly search?: string;
  readonly status?: AdminUserStatus;
  readonly role?: string;
  readonly permission?: string;
}

export interface AdminUserView {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName?: string;
  readonly status: AdminUserStatus;
  readonly roles: string[];
  readonly permissions: string[];
  readonly locale?: string;
  readonly theme?: string;
  readonly avatarUrl?: string;
  readonly avatarStatus?: "none" | "provider" | "manual" | "deleted";
  readonly lastLoginAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminUserListPayload {
  readonly items: AdminUserView[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface AdminDashboardSummary {
  readonly totalUsers: number;
  readonly activeUsers: number;
  readonly disabledUsers: number;
  readonly invitedUsers: number;
  readonly recentAuditEvents: number;
  readonly recentAudit: AdminAuditLogView[];
}
