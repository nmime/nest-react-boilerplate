import type { adminApi } from "@app/frontend/api-client";

export type UserStatus = adminApi.AdminUserViewDto["status"];
export type UserRow = adminApi.AdminUserViewDto & Record<string, unknown>;
