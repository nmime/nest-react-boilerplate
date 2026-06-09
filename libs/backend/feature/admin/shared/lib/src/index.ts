import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";
import type { Locale } from "@app/common/i18n";

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ];
};

export const ADMIN_ROLE = "admin";
export const USER_ROLE = "user";
export const USER_PROFILE_READ_PERMISSION = "profile:read";

export const ADMIN_PROFILE_READ_PERMISSION = "admin:profile:read";
export const ADMIN_DASHBOARD_READ_PERMISSION = "admin:dashboard:read";
export const ADMIN_USERS_READ_PERMISSION = "admin:users:read";
export const ADMIN_USERS_WRITE_PERMISSION = "admin:users:write";
export const ADMIN_USERS_STATUS_UPDATE_PERMISSION = "admin:users:status:update";
export const ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION =
  "admin:users:access-policy:update";
export const ADMIN_ROLES_READ_PERMISSION = "admin:roles:read";
export const ADMIN_AUDIT_READ_PERMISSION = "admin:audit:read";
export const ADMIN_SETTINGS_READ_PERMISSION = "admin:settings:read";
export const ADMIN_SETTINGS_UPDATE_PERMISSION = "admin:settings:update";
export const ADMIN_MANAGE_ALL_PERMISSION = "admin:manage:all";

export const ADMIN_MANAGE_ACTION = "manage";
export const ADMIN_ALL_RESOURCE = "all";

export const adminActions = [
  "read",
  "write",
  "status:update",
  "access-policy:update",
  "update",
  ADMIN_MANAGE_ACTION,
] as const;

export const adminResources = [
  "admin.dashboard",
  "admin.profile",
  "admin.users",
  "admin.roles",
  "admin.audit",
  "admin.settings",
] as const;

export type AdminAction = (typeof adminActions)[number];
export type AdminResource = (typeof adminResources)[number];
export type AdminSubject = AdminResource | typeof ADMIN_ALL_RESOURCE;
export type AdminAbility = MongoAbility<[AdminAction, AdminSubject]>;

export interface AdminPrincipalClaims {
  subject?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

export const adminPermissionCatalog = [
  {
    permission: ADMIN_DASHBOARD_READ_PERMISSION,
    resource: "admin.dashboard",
    action: "read",
    description: "Read admin dashboard metrics and summaries.",
  },
  {
    permission: ADMIN_PROFILE_READ_PERMISSION,
    resource: "admin.profile",
    action: "read",
    description: "Read the current administrator profile.",
  },
  {
    permission: ADMIN_USERS_READ_PERMISSION,
    resource: "admin.users",
    action: "read",
    description: "Search and inspect admin-visible user records.",
  },
  {
    permission: ADMIN_USERS_WRITE_PERMISSION,
    resource: "admin.users",
    action: "write",
    description: "General guarded admin user write capability.",
  },
  {
    permission: ADMIN_USERS_STATUS_UPDATE_PERMISSION,
    resource: "admin.users",
    action: "status:update",
    description: "Enable, disable, or invite admin-visible users.",
  },
  {
    permission: ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
    resource: "admin.users",
    action: "access-policy:update",
    description: "Update user roles and permission assignments.",
  },
  {
    permission: ADMIN_ROLES_READ_PERMISSION,
    resource: "admin.roles",
    action: "read",
    description: "Read the admin RBAC roles and permissions catalog.",
  },
  {
    permission: ADMIN_AUDIT_READ_PERMISSION,
    resource: "admin.audit",
    action: "read",
    description: "Read redacted admin audit events.",
  },
  {
    permission: ADMIN_SETTINGS_READ_PERMISSION,
    resource: "admin.settings",
    action: "read",
    description: "Read admin settings metadata.",
  },
  {
    permission: ADMIN_SETTINGS_UPDATE_PERMISSION,
    resource: "admin.settings",
    action: "update",
    description: "Update guarded admin settings.",
  },
  {
    permission: ADMIN_MANAGE_ALL_PERMISSION,
    resource: ADMIN_ALL_RESOURCE,
    action: ADMIN_MANAGE_ACTION,
    description:
      "Explicit break-glass permission to manage every admin resource.",
  },
] as const satisfies readonly {
  permission: string;
  resource: AdminSubject;
  action: AdminAction;
  description: string;
}[];

export type AdminPermission =
  (typeof adminPermissionCatalog)[number]["permission"];

const adminPermissionByName: ReadonlyMap<
  string,
  (typeof adminPermissionCatalog)[number]
> = new Map(adminPermissionCatalog.map((item) => [item.permission, item]));

export const adminRolePermissionMatrix = {
  [USER_ROLE]: [USER_PROFILE_READ_PERMISSION],
  [ADMIN_ROLE]: adminPermissionCatalog.map((item) => item.permission),
} as const satisfies Record<string, readonly string[]>;

export const adminRoleCatalog = [
  {
    role: USER_ROLE,
    label: "User",
    description: "Baseline application user role.",
    permissions: [...adminRolePermissionMatrix[USER_ROLE]],
  },
  {
    role: ADMIN_ROLE,
    label: "Administrator",
    description: "Back-office administrator with explicit granular grants.",
    permissions: [...adminRolePermissionMatrix[ADMIN_ROLE]],
  },
] as const;

export const adminAssignableRoles = adminRoleCatalog.map((item) => item.role);
export const adminAssignablePermissions = [
  USER_PROFILE_READ_PERMISSION,
  ...adminPermissionCatalog.map((item) => item.permission),
] as const;

export const isAdminAssignableRole = (value: string): boolean =>
  adminAssignableRoles.includes(value as (typeof adminAssignableRoles)[number]);

export const isAdminAssignablePermission = (value: string): boolean =>
  adminAssignablePermissions.includes(
    value as (typeof adminAssignablePermissions)[number],
  );

export const isKnownAdminPermission = (
  value: string,
): value is AdminPermission => adminPermissionByName.has(value);

export const adminPermissionToAbility = (
  permission: string,
): { action: AdminAction; resource: AdminSubject } | undefined => {
  const item = adminPermissionByName.get(permission);

  return item ? { action: item.action, resource: item.resource } : undefined;
};

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

  if (!principal?.subject || !roles.includes(ADMIN_ROLE)) {
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

export interface AdminAccessPolicy {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
  canAccessAdmin: boolean;
  canReadDashboard: boolean;
  canReadProfile: boolean;
  canReadUsers: boolean;
  canUpdateUserStatus: boolean;
  canUpdateUserAccessPolicy: boolean;
  canReadRoles: boolean;
  canReadAudit: boolean;
  canReadSettings: boolean;
  canUpdateSettings: boolean;
}

export interface AdminProfileView {
  id: string;
  email?: string;
  displayName?: string;
  locale?: Locale;
  roles: string[];
  permissions: string[];
}

export interface AdminRbacCatalogView {
  resources: readonly AdminResource[];
  roles: typeof adminRoleCatalog;
  permissions: typeof adminPermissionCatalog;
  assignableRoles: readonly string[];
  assignablePermissions: readonly string[];
}

export const createAdminAccessPolicy = (
  principal?: AdminPrincipalClaims,
): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const ability = createAdminAbility(principal);
  const canReadProfile = canAdmin(ability, "read", "admin.profile");
  const canReadDashboard = canAdmin(ability, "read", "admin.dashboard");
  const canReadUsers = canAdmin(ability, "read", "admin.users");
  const canUpdateUserStatus = canAdmin(ability, "status:update", "admin.users");
  const canUpdateUserAccessPolicy = canAdmin(
    ability,
    "access-policy:update",
    "admin.users",
  );
  const canReadRoles = canAdmin(ability, "read", "admin.roles");
  const canReadAudit = canAdmin(ability, "read", "admin.audit");
  const canReadSettings = canAdmin(ability, "read", "admin.settings");
  const canUpdateSettings = canAdmin(ability, "update", "admin.settings");

  return {
    isAuthenticated: Boolean(principal?.subject),
    roles,
    permissions,
    canAccessAdmin:
      canReadProfile ||
      canReadDashboard ||
      canReadUsers ||
      canReadRoles ||
      canReadAudit ||
      canReadSettings ||
      canAdmin(ability, ADMIN_MANAGE_ACTION, ADMIN_ALL_RESOURCE),
    canReadDashboard,
    canReadProfile,
    canReadUsers,
    canUpdateUserStatus,
    canUpdateUserAccessPolicy,
    canReadRoles,
    canReadAudit,
    canReadSettings,
    canUpdateSettings,
  };
};

export const assertAdminProfilePermission = <T extends AdminPrincipalClaims>(
  principal: T,
): T => {
  const policy = createAdminAccessPolicy(principal);
  if (!policy.canReadProfile) {
    throw new Error("Admin profile permission is required.");
  }

  return principal;
};

export const toAdminProfileView = <
  T extends AdminPrincipalClaims & {
    email?: string;
    displayName?: string;
    locale?: unknown;
  },
>(
  principal: T,
): AdminProfileView => {
  assertAdminProfilePermission(principal);
  const policy = createAdminAccessPolicy(principal);

  return {
    id: principal.subject ?? "",
    email: principal.email,
    displayName: principal.displayName,
    locale: principal.locale as Locale,
    roles: policy.roles,
    permissions: policy.permissions,
  };
};

export const toAdminRbacCatalogView = (): AdminRbacCatalogView => ({
  resources: adminResources,
  roles: adminRoleCatalog,
  permissions: adminPermissionCatalog,
  assignableRoles: adminAssignableRoles,
  assignablePermissions: adminAssignablePermissions,
});
