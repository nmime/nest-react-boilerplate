import { isAdminAssignablePermission, isAdminAssignableRole } from '@app/backend-feature-admin-shared';
import { AdminApplicationError } from '../admin-errors';
import type { UpdateAdminUserAccessPolicyCommand } from '../../domain';

export const requireAllowedPolicy = (input: UpdateAdminUserAccessPolicyCommand): void => {
  const unknownRoles = input.roles.filter((role) => !isAdminAssignableRole(role));
  const unknownPermissions = input.permissions.filter((permission) => !isAdminAssignablePermission(permission));
  if (unknownRoles.length > 0 || unknownPermissions.length > 0) {
    throw new AdminApplicationError(
      'invalid_access_policy',
      'Access policy contains roles or permissions outside the admin catalog.',
    );
  }
};
