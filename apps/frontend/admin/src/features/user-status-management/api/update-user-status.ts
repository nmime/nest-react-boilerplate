import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/frontend/api-client";
import type { UserStatus } from "../../../entities/admin-user";

export const updateUserStatus = (
  id: string,
  status: UserStatus,
  requestOptions?: ApiClientRequestOptions,
) =>
  throwOnOpenApiErrorData(
    adminApi.adminUsersControllerUpdateUserStatus(
      id,
      { status },
      requestOptions,
    ),
  );
