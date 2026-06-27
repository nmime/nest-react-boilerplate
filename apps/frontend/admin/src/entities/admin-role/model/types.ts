import type { adminApi } from "@app/frontend/api-client";

export type RoleRow =
  adminApi.AdminRbacCatalogPayloadDto["permissions"][number] &
    Record<string, unknown>;
