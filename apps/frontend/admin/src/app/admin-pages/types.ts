import { adminApi, type ApiClientRequestOptions } from "@app/api-client";
import type { AdminAccess, AdminProfilePayload } from "../auth-rbac";

export type AdminProfileState =
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | { status: "ready"; payload: AdminProfilePayload; access: AdminAccess };

export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}

export type UserStatus = adminApi.AdminUserViewDto["status"];
export type UserRow = adminApi.AdminUserViewDto & Record<string, unknown>;
export type AuditRow = adminApi.AdminAuditLogViewDto & Record<string, unknown>;
export type RoleRow =
  adminApi.AdminRbacCatalogPayloadDto["permissions"][number] &
    Record<string, unknown>;
