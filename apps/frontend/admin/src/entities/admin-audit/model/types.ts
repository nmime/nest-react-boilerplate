import type { adminApi } from "@app/frontend/api-client";

export type AuditRow = adminApi.AdminAuditLogViewDto & Record<string, unknown>;
