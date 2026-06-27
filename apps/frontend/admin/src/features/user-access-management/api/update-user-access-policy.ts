import {
  adminApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/frontend/api-client";

export const updateUserAccessPolicy = (
  id: string,
  payload: adminApi.UpdateAdminUserAccessPolicyDto,
  requestOptions?: ApiClientRequestOptions,
) =>
  throwOnOpenApiErrorData(
    adminApi.adminUsersControllerUpdateUserAccessPolicy(
      id,
      payload,
      requestOptions,
    ),
  );
