import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/frontend-api-client";

export const createRole = (
  payload: adminApi.CreateAdminRoleDto,
  requestOptions?: ApiClientRequestOptions,
) =>
  throwOnOpenApiErrorData(
    adminApi.adminRolesControllerCreateRole(payload, requestOptions),
  );
