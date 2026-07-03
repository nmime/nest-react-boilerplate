/* eslint-disable @typescript-eslint/triple-slash-reference -- CASL 7 publishes exported declarations behind package exports that TypeScript node resolution cannot associate with the CommonJS entry; this scoped reference loads a type-preserving re-export shim. */
/// <reference path="./types/casl-ability.d.ts" />
import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";
import type { Locale } from "@app/common-i18n";

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

export const AdminRole = "admin";
export const UserRole = "user";
export const UserProfileReadPermission = "profile:read";

export const AdminProfileReadPermission = "admin:profile:read";
export const AdminDashboardReadPermission = "admin:dashboard:read";
export const AdminUsersReadPermission = "admin:users:read";
export const AdminUsersWritePermission = "admin:users:write";
export const AdminUsersStatusUpdatePermission = "admin:users:status:update";
export const AdminUsersAccessPolicyUpdatePermission =
  "admin:users:access-policy:update";
export const AdminRolesReadPermission = "admin:roles:read";
export const AdminAuditReadPermission = "admin:audit:read";
export const AdminSettingsReadPermission = "admin:settings:read";
export const AdminSettingsUpdatePermission = "admin:settings:update";
export const AdminManageAllPermission = "admin:manage:all";

export const AdminManageAction = "manage";
export const AdminAllResource = "all";

export const adminActions = [
  "read",
  "write",
  "status:update",
  "access-policy:update",
  "update",
  AdminManageAction,
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
export type AdminSubject = AdminResource | typeof AdminAllResource;
export type AdminAbility = MongoAbility<[AdminAction, AdminSubject]>;

export interface AdminPrincipalClaims {
  subject?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

export const adminPermissionCatalog = [
  {
    permission: AdminDashboardReadPermission,
    resource: "admin.dashboard",
    action: "read",
    description: "Read admin dashboard metrics and summaries.",
  },
  {
    permission: AdminProfileReadPermission,
    resource: "admin.profile",
    action: "read",
    description: "Read the current administrator profile.",
  },
  {
    permission: AdminUsersReadPermission,
    resource: "admin.users",
    action: "read",
    description: "Search and inspect admin-visible user records.",
  },
  {
    permission: AdminUsersWritePermission,
    resource: "admin.users",
    action: "write",
    description: "General guarded admin user write capability.",
  },
  {
    permission: AdminUsersStatusUpdatePermission,
    resource: "admin.users",
    action: "status:update",
    description: "Enable, disable, or invite admin-visible users.",
  },
  {
    permission: AdminUsersAccessPolicyUpdatePermission,
    resource: "admin.users",
    action: "access-policy:update",
    description: "Update user roles and permission assignments.",
  },
  {
    permission: AdminRolesReadPermission,
    resource: "admin.roles",
    action: "read",
    description: "Read the admin RBAC roles and permissions catalog.",
  },
  {
    permission: AdminAuditReadPermission,
    resource: "admin.audit",
    action: "read",
    description: "Read redacted admin audit events.",
  },
  {
    permission: AdminSettingsReadPermission,
    resource: "admin.settings",
    action: "read",
    description: "Read admin settings metadata.",
  },
  {
    permission: AdminSettingsUpdatePermission,
    resource: "admin.settings",
    action: "update",
    description: "Update guarded admin settings.",
  },
  {
    permission: AdminManageAllPermission,
    resource: AdminAllResource,
    action: AdminManageAction,
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
  [UserRole]: [UserProfileReadPermission],
  [AdminRole]: adminPermissionCatalog.map((item) => item.permission),
} as const satisfies Record<string, readonly string[]>;

export const adminRoleCatalog = [
  {
    role: UserRole,
    label: "User",
    description: "Baseline application user role.",
    permissions: [...adminRolePermissionMatrix[UserRole]],
  },
  {
    role: AdminRole,
    label: "Administrator",
    description: "Back-office administrator with explicit granular grants.",
    permissions: [...adminRolePermissionMatrix[AdminRole]],
  },
] as const;

export const adminAssignableRoles = adminRoleCatalog.map((item) => item.role);
export const adminAssignablePermissions = [
  UserProfileReadPermission,
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
      canAdmin(ability, AdminManageAction, AdminAllResource),
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
