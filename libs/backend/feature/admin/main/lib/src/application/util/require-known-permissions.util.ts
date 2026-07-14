import { isKnownPermission } from '@app/common-authz';
import { AdminApplicationError } from '../admin-errors';

export const requireKnownPermissions = (permissions: readonly string[]): string[] => {
  const distinct = [...new Set(permissions)];
  const unknown = distinct.filter((permission) => !isKnownPermission(permission));
  if (unknown.length > 0) {
    throw new AdminApplicationError('invalid_access_policy', `Unknown permission keys: ${unknown.join(', ')}.`);
  }

  return distinct;
};
