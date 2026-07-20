import type { adminApi } from '@app/frontend-api-client';
import type { UserStatus } from '../../../entities/admin-user';
import { pageSize } from '../../../shared';

const userStatuses = new Set<UserStatus>(['active', 'disabled', 'invited']);
const userRoles = new Set<NonNullable<adminApi.AdminUsersListQuery['role']>>(['user', 'admin']);
const userPermissions = new Set<NonNullable<adminApi.AdminUsersListQuery['permission']>>([
  'profile:read',
  'admin:dashboard:read',
  'admin:profile:read',
  'admin:users:read',
  'admin:users:write',
  'admin:users:status:update',
  'admin:users:access-policy:update',
  'admin:roles:read',
  'admin:roles:write',
  'admin:audit:read',
  'admin:settings:read',
  'admin:settings:update',
  'admin:manage:all',
]);

export const parseAdminUsersPage = (value: string | null | undefined): number => {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
};

export const parseAdminUserStatusFilter = (value: string | null | undefined): UserStatus | 'all' =>
  value && userStatuses.has(value as UserStatus) ? (value as UserStatus) : 'all';

export const parseAdminUserRoleFilter = (
  value: string | null | undefined,
): NonNullable<adminApi.AdminUsersListQuery['role']> | 'all' =>
  value && userRoles.has(value as NonNullable<adminApi.AdminUsersListQuery['role']>)
    ? (value as NonNullable<adminApi.AdminUsersListQuery['role']>)
    : 'all';

export const parseAdminUserPermissionFilter = (
  value: string | null | undefined,
): NonNullable<adminApi.AdminUsersListQuery['permission']> | 'all' =>
  value && userPermissions.has(value as NonNullable<adminApi.AdminUsersListQuery['permission']>)
    ? (value as NonNullable<adminApi.AdminUsersListQuery['permission']>)
    : 'all';

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
}>): adminApi.AdminUsersListQuery => {
  const normalizedStatus = parseAdminUserStatusFilter(status);
  const normalizedRole = parseAdminUserRoleFilter(role);
  const normalizedPermission = parseAdminUserPermissionFilter(permission);

  return {
    limit: pageSize,
    offset: (Number.isInteger(page) && page > 0 ? page - 1 : 0) * pageSize,
    search: search.trim() || undefined,
    status: normalizedStatus === 'all' ? undefined : normalizedStatus,
    role: normalizedRole === 'all' ? undefined : normalizedRole,
    permission: normalizedPermission === 'all' ? undefined : normalizedPermission,
  };
};
