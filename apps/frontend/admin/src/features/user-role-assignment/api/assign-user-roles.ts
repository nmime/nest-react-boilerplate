import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';

export const assignUserRoles = (
  id: string,
  roles: adminApi.AssignAdminUserRolesDto['roles'],
  requestOptions?: ApiClientRequestOptions,
) => throwOnOpenApiErrorData(adminApi.adminRolesControllerAssignUserRoles(id, { roles }, requestOptions));
