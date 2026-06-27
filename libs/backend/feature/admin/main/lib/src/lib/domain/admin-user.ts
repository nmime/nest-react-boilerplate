export const adminUserStatuses = ["active", "disabled", "invited"] as const;

export const adminAuditActions = [
  "admin.user.status.update",
  "admin.user.access_policy.update",
] as const;

export const ADMIN_MAX_PAGE_SIZE = 100;

export type AdminUserStatus = (typeof adminUserStatuses)[number];
export type AdminAuditAction = (typeof adminAuditActions)[number];

export interface AdminPageQuery {
  readonly limit?: number;
  readonly offset?: number;
}

export interface AdminPage {
  readonly limit: number;
  readonly offset: number;
}

export interface AdminUserQuery extends AdminPageQuery {
  readonly search?: string;
  readonly status?: AdminUserStatus;
  readonly role?: string;
  readonly permission?: string;
}

export interface AdminAuditQuery extends AdminPageQuery {
  readonly action?: AdminAuditAction;
  readonly actorUserId?: string;
  readonly targetUserId?: string;
}

export interface UpdateAdminUserStatusCommand {
  readonly status: AdminUserStatus;
}

export interface UpdateAdminUserAccessPolicyCommand {
  readonly roles: string[];
  readonly permissions: string[];
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

export interface AdminDashboardSummary {
  readonly totalUsers: number;
  readonly activeUsers: number;
  readonly disabledUsers: number;
  readonly invitedUsers: number;
  readonly recentAuditEvents: number;
  readonly recentAudit: AdminAuditLogView[];
}

export const normalizeAdminPage = (query: AdminPageQuery): AdminPage => ({
  limit: Math.min(query.limit ?? 50, ADMIN_MAX_PAGE_SIZE),
  offset: query.offset ?? 0,
});
