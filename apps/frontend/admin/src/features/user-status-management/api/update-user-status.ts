import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import type { UserStatus } from '../../../entities/admin-user';

export const updateUserStatus = (
  id: string,
  status: UserStatus,
  reason: string,
  requestOptions?: ApiClientRequestOptions,
) =>
  throwOnOpenApiErrorData(
    adminApi.adminUsersControllerUpdateUserStatus(id, { status, reason: reason.trim() }, requestOptions),
  );
