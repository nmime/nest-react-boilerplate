import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type { AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import { normalizeStringList } from './normalize';
import {
  adminPermissionToAbility,
  type AdminAction,
  type AdminPrincipalClaims,
  type AdminSubject,
} from './permissions';

export type AdminAbility = MongoAbility<[AdminAction, AdminSubject]>;

/**
 * Authorization state created by the database access guard. Authentication
 * claims alone must never be used as the source of admin authorization.
 */
export interface AdminAuthorizedRequest extends AuthenticatedRequest {
  adminAbility?: AdminAbility;
}

export const createAdminAbility = (principal?: AdminPrincipalClaims): AdminAbility => {
  const { can, build } = new AbilityBuilder<AdminAbility>(createMongoAbility);
  const permissions = normalizeStringList(principal?.permissions);

  if (!principal?.subject) {
    return build();
  }

  for (const permission of permissions) {
    const abilityRule = adminPermissionToAbility(permission);
    if (!abilityRule) {
      continue;
    }

    can(abilityRule.action, abilityRule.resource);
  }

  return build();
};

const isAdminAbility = (value: unknown): value is AdminAbility =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'can' in value &&
    typeof value.can === 'function' &&
    'cannot' in value &&
    typeof value.cannot === 'function',
  );

const resolveAdminAbility = (principalOrAbility?: AdminPrincipalClaims | AdminAbility): AdminAbility =>
  isAdminAbility(principalOrAbility) ? principalOrAbility : createAdminAbility(principalOrAbility);

export const canAdmin = (
  principalOrAbility: AdminPrincipalClaims | AdminAbility | undefined,
  action: AdminAction,
  resource: AdminSubject,
): boolean => resolveAdminAbility(principalOrAbility).can(action, resource);

export const cannotAdmin = (
  principalOrAbility: AdminPrincipalClaims | AdminAbility | undefined,
  action: AdminAction,
  resource: AdminSubject,
): boolean => resolveAdminAbility(principalOrAbility).cannot(action, resource);
