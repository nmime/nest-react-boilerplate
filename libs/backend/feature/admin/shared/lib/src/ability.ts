/* eslint-disable @typescript-eslint/triple-slash-reference -- CASL 7 publishes exported declarations behind package exports that TypeScript node resolution cannot associate with the CommonJS entry; this scoped reference loads a type-preserving re-export shim. */
/// <reference path="./type/casl-ability.d.ts" />
import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";
import { normalizeStringList } from "./normalize";
import {
  AdminRole,
  adminPermissionToAbility,
  adminRolePermissionMatrix,
  type AdminAction,
  type AdminPrincipalClaims,
  type AdminSubject,
} from "./permissions";

export type AdminAbility = MongoAbility<[AdminAction, AdminSubject]>;

const rolePermissionMatrix: Record<string, readonly string[]> =
  adminRolePermissionMatrix;

const roleAllowsPermission = (roles: readonly string[], permission: string) =>
  roles.some((role) => (rolePermissionMatrix[role] ?? []).includes(permission));

export const createAdminAbility = (
  principal?: AdminPrincipalClaims,
): AdminAbility => {
  const { can, build } = new AbilityBuilder<AdminAbility>(createMongoAbility);
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);

  if (!principal?.subject || !roles.includes(AdminRole)) {
    return build();
  }

  for (const permission of permissions) {
    const abilityRule = adminPermissionToAbility(permission);
    if (!abilityRule || !roleAllowsPermission(roles, permission)) {
      continue;
    }

    can(abilityRule.action, abilityRule.resource);
  }

  return build();
};

const isAdminAbility = (value: unknown): value is AdminAbility =>
  Boolean(
    value &&
    typeof value === "object" &&
    "can" in value &&
    typeof value.can === "function" &&
    "cannot" in value &&
    typeof value.cannot === "function",
  );

const resolveAdminAbility = (
  principalOrAbility?: AdminPrincipalClaims | AdminAbility,
): AdminAbility =>
  isAdminAbility(principalOrAbility)
    ? principalOrAbility
    : createAdminAbility(principalOrAbility);

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
