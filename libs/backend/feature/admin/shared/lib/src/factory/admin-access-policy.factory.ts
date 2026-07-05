import { canAdmin, createAdminAbility } from "../ability";
import { AdminAllResource, AdminManageAction } from "../const";
import { normalizeStringList } from "../normalize";
import type { AdminAccessPolicy } from "../type/admin-access-policy.type";
import type { AdminPrincipalClaims } from "../type/admin-permission.type";

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
