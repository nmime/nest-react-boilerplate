import type { adminApi } from "@app/api-client";

export type RoleRow =
  adminApi.AdminRbacCatalogPayloadDto["permissions"][number] &
    Record<string, unknown>;
