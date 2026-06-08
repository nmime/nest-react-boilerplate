import type { adminApi } from "@app/api-client";

export type AuditRow = adminApi.AdminAuditLogViewDto & Record<string, unknown>;
