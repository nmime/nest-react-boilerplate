import {
  AdminManageAllPermission,
  isAdminAssignablePermission,
  isAdminAssignableRole,
} from '@app/backend-feature-admin-shared';
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
  // The break-glass `admin:manage:all` grant is provisioned out-of-band (the
  // bootstrap admin allowlist), never through this scoped access-policy
  // endpoint. Catalog membership alone is not authority to hand it out, so a
  // scoped admin cannot self-assign (or grant another user) full break-glass
  // access this way.
  if (input.permissions.includes(AdminManageAllPermission)) {
    throw new AdminApplicationError(
      'invalid_access_policy',
      'Access policy cannot grant the break-glass admin:manage:all permission.',
    );
  }
};
