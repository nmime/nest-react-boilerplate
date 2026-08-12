import {
  AdminProfileReadPermission,
  AdminDashboardReadPermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminAuditReadPermission,
  AdminAuthLoginAnalyticsReadPermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminNotificationTemplatesReadPermission,
  AdminNotificationTemplatesWritePermission,
  AdminNotificationTemplatesTestPermission,
  AdminNotificationSegmentsReadPermission,
  AdminNotificationSegmentsWritePermission,
  AdminNotificationBroadcastsReadPermission,
  AdminNotificationBroadcastsWritePermission,
  AdminNotificationBroadcastsSendPermission,
  AdminNotificationBroadcastsApprovePermission,
  AdminFeatureFlagsReadPermission,
  AdminFeatureFlagsWritePermission,
  AdminManageAllPermission,
  normalizeStringList,
} from '@app/common-authz';

export interface AdminPrincipalClaims {
  subject?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

/** Maps one admin console capability flag to the permission that grants it. */
export type AdminCapabilityMap = Readonly<Record<string, string>>;

/**
 * The whole admin policy in one place: every `canXxx` flag the console gates on, and the
 * permission behind it. The policy type and the runtime object are both derived from this map, so
 * a capability is declared exactly once.
 */
export const AdminCapabilityPermissions = {
  canReadProfile: AdminProfileReadPermission,
  canReadDashboard: AdminDashboardReadPermission,
  canReadUsers: AdminUsersReadPermission,
  canUpdateUserStatus: AdminUsersStatusUpdatePermission,
  canUpdateUserAccessPolicy: AdminUsersAccessPolicyUpdatePermission,
  canReadRoles: AdminRolesReadPermission,
  canWriteRoles: AdminRolesWritePermission,
  canReadAudit: AdminAuditReadPermission,
  canReadAuthLoginAnalytics: AdminAuthLoginAnalyticsReadPermission,
  canReadSettings: AdminSettingsReadPermission,
  canUpdateSettings: AdminSettingsUpdatePermission,
  canReadNotificationTemplates: AdminNotificationTemplatesReadPermission,
  canWriteNotificationTemplates: AdminNotificationTemplatesWritePermission,
  canTestNotificationTemplates: AdminNotificationTemplatesTestPermission,
  canReadNotificationSegments: AdminNotificationSegmentsReadPermission,
  canWriteNotificationSegments: AdminNotificationSegmentsWritePermission,
  canReadNotificationBroadcasts: AdminNotificationBroadcastsReadPermission,
  canWriteNotificationBroadcasts: AdminNotificationBroadcastsWritePermission,
  canSendNotificationBroadcasts: AdminNotificationBroadcastsSendPermission,
  canApproveNotificationBroadcasts: AdminNotificationBroadcastsApprovePermission,
  canReadFeatureFlags: AdminFeatureFlagsReadPermission,
  canWriteFeatureFlags: AdminFeatureFlagsWritePermission,
} as const satisfies AdminCapabilityMap;

export interface AdminAccessPolicyIdentity {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
  canAccessAdmin: boolean;
}

export type AdminAccessPolicyFor<Capabilities extends AdminCapabilityMap> = AdminAccessPolicyIdentity &
  Record<keyof Capabilities, boolean>;

export type AdminAccessPolicy = AdminAccessPolicyFor<typeof AdminCapabilityPermissions>;

/** One product's additional admin capabilities. The id names the extension in composition errors. */
export interface AdminCapabilityExtension<Capabilities extends AdminCapabilityMap = AdminCapabilityMap> {
  readonly id: string;
  readonly capabilities: Capabilities;
}

export interface AdminCapabilityCompositionInput<
  Base extends AdminCapabilityMap,
  Extensions extends readonly AdminCapabilityExtension[],
> {
  readonly capabilities: Base;
  readonly extensions: Extensions;
}

// Extensions arrive as an array, so `Extensions[number]` is a union; intersecting it keeps every
// extension's capabilities individually addressable on the composed policy instead of collapsing
// them into "one of these shapes".
type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

export type ComposedAdminCapabilities<
  Base extends AdminCapabilityMap,
  Extensions extends readonly AdminCapabilityExtension[],
> = Base & UnionToIntersection<Extensions[number]['capabilities']>;

/**
 * Folds product extensions into the shared capability map. Both failure modes here would otherwise
 * surface as an admin screen silently gated on the wrong permission, so each throws at composition
 * (module load) instead: a capability may not be redefined, and it may not name a blank permission.
 */
export const composeAdminCapabilities = <
  const Base extends AdminCapabilityMap,
  const Extensions extends readonly AdminCapabilityExtension[],
>({
  capabilities,
  extensions,
}: AdminCapabilityCompositionInput<Base, Extensions>): ComposedAdminCapabilities<Base, Extensions> => {
  const composed = new Map<string, string>(Object.entries(capabilities));

  for (const extension of extensions) {
    for (const [capability, permission] of Object.entries(extension.capabilities)) {
      if (composed.has(capability)) {
        throw new Error(`admin access-policy extension "${extension.id}" redefines capability "${capability}"`);
      }
      if (permission.trim() === '') {
        throw new Error(
          `admin access-policy extension "${extension.id}" maps capability "${capability}" to a blank permission`,
        );
      }

      composed.set(capability, permission);
    }
  }

  return Object.fromEntries(composed) as ComposedAdminCapabilities<Base, Extensions>;
};

const hasPermission = (permissions: readonly string[], permission: string): boolean =>
  permissions.includes(permission) || permissions.includes(AdminManageAllPermission);

/**
 * Builds the policy reader for a capability map. Products call this with their composed map rather
 * than forking this library, and get the same wildcard, fail-closed and `canAccessAdmin` semantics.
 */
export const createAdminAccessPolicyFactory =
  <const Capabilities extends AdminCapabilityMap>(capabilityPermissions: Capabilities) =>
  (principal?: AdminPrincipalClaims): AdminAccessPolicyFor<Capabilities> => {
    const roles = normalizeStringList(principal?.roles);
    const permissions = normalizeStringList(principal?.permissions);
    const isAuthenticated = Boolean(principal?.subject);
    const capabilities = Object.fromEntries(
      Object.entries(capabilityPermissions).map(([capability, permission]) => [
        capability,
        isAuthenticated && hasPermission(permissions, permission),
      ]),
    ) as Record<keyof Capabilities, boolean>;

    return {
      isAuthenticated,
      roles,
      permissions,
      canAccessAdmin: Object.values(capabilities).some(Boolean),
      ...capabilities,
    };
  };

export const createAdminAccessPolicy = createAdminAccessPolicyFactory(AdminCapabilityPermissions);

export const assertCanReadAdminProfile = (principal?: AdminPrincipalClaims): void => {
  const policy = createAdminAccessPolicy(principal);
  if (!policy.canReadProfile) {
    throw new Error('Admin profile permission is required.');
  }
};
