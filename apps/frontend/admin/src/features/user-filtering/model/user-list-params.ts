import type { adminApi } from "@app/frontend/api-client";
import type { UserStatus } from "../../../entities/admin-user";
import { pageSize } from "../../../shared";

export const toUserListParams = ({
  page,
  permission,
  role,
  search,
  status,
}: Readonly<{
  page: number;
  permission: string;
  role: string;
  search: string;
  status: string;
}>): adminApi.AdminUsersListQuery => ({
  limit: pageSize,
  offset: (Math.max(1, page) - 1) * pageSize,
  search: search.trim() || undefined,
  status: status === "all" ? undefined : (status as UserStatus),
  role: role === "all" ? undefined : (role as "user" | "admin"),
  permission:
    permission === "all"
      ? undefined
      : (permission as adminApi.AdminUsersListQuery["permission"]),
});
