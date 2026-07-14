import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';

export const setRolePermissions = (
  id: string,
  permissions: adminApi.SetAdminRolePermissionsDto['permissions'],
  requestOptions?: ApiClientRequestOptions,
) => throwOnOpenApiErrorData(adminApi.adminRolesControllerSetRolePermissions(id, { permissions }, requestOptions));
