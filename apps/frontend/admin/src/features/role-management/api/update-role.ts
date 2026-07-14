import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';

export const updateRole = (
  id: string,
  payload: adminApi.UpdateAdminRoleDto,
  requestOptions?: ApiClientRequestOptions,
) => throwOnOpenApiErrorData(adminApi.adminRolesControllerUpdateRole(id, payload, requestOptions));
