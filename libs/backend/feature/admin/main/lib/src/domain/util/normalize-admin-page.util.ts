import { AdminMaxPageSize } from "../const";
import type { AdminPage, AdminPageQuery } from "../type";

export const normalizeAdminPage = (query: AdminPageQuery): AdminPage => ({
  limit: Math.min(query.limit ?? 50, AdminMaxPageSize),
  offset: query.offset ?? 0,
});
