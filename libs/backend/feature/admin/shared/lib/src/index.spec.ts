import { describe, expect, it } from "vitest";
import {
  AdminAuditReadPermission,
  AdminDashboardReadPermission,
  AdminManageAction,
  AdminManageAllPermission,
  AdminAllResource,
  AdminProfileReadPermission,
  AdminRole,
  AdminRolesReadPermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  assertAdminProfilePermission,
  canAdmin,
  cannotAdmin,
  createAdminAbility,
  createAdminAccessPolicy,
  isKnownAdminPermission,
  toAdminProfileView,
} from "./index";

const adminPrincipal = {
  subject: "admin-id",
  email: "admin@example.com",
  displayName: "Ada Admin",
  locale: "ru",
  roles: [AdminRole, AdminRole],
  permissions: [AdminProfileReadPermission, AdminDashboardReadPermission],
};

describe("@app/backend-feature-admin-shared CASL RBAC", () => {
  it("derives an admin CASL ability from explicit RBAC roles and permissions", () => {
    const ability = createAdminAbility({
      subject: "admin-id",
      roles: [AdminRole],
      permissions: [
        AdminDashboardReadPermission,
        AdminUsersReadPermission,
        AdminUsersStatusUpdatePermission,
        AdminUsersAccessPolicyUpdatePermission,
      ],
    });

    expect(canAdmin(ability, "read", "admin.dashboard")).toBe(true);
    expect(canAdmin(ability, "read", "admin.users")).toBe(true);
    expect(canAdmin(ability, "status:update", "admin.users")).toBe(true);
    expect(canAdmin(ability, "access-policy:update", "admin.users")).toBe(true);
    expect(cannotAdmin(ability, "read", "admin.audit")).toBe(true);
  });

  it("grants profile and dashboard access for admin principals", () => {
    expect(createAdminAccessPolicy(adminPrincipal)).toEqual({
      isAuthenticated: true,
      roles: [AdminRole],
      permissions: [AdminProfileReadPermission, AdminDashboardReadPermission],
      canAccessAdmin: true,
      canReadDashboard: true,
      canReadProfile: true,
      canReadUsers: false,
      canUpdateUserStatus: false,
      canUpdateUserAccessPolicy: false,
      canReadRoles: false,
      canReadAudit: false,
      canReadSettings: false,
      canUpdateSettings: false,
    });
  });

  it("keeps RBAC fail-closed without authenticated admin claims", () => {
    expect(createAdminAccessPolicy()).toEqual({
      isAuthenticated: false,
      roles: [],
      permissions: [],
      canAccessAdmin: false,
      canReadDashboard: false,
      canReadProfile: false,
      canReadUsers: false,
      canUpdateUserStatus: false,
      canUpdateUserAccessPolicy: false,
      canReadRoles: false,
      canReadAudit: false,
      canReadSettings: false,
      canUpdateSettings: false,
    });
    expect(
      createAdminAccessPolicy({
        subject: "support-id",
        roles: ["support"],
        permissions: [AdminProfileReadPermission],
      }),
    ).toMatchObject({ canAccessAdmin: false, canReadProfile: false });
  });

  it("denies admin role alone without explicit permissions", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [AdminRole],
        permissions: [],
      }),
    ).toMatchObject({
      canAccessAdmin: false,
      canReadDashboard: false,
      canReadProfile: false,
      canReadUsers: false,
    });
  });

  it("denies admin permissions when the admin role is absent", () => {
    expect(
      createAdminAccessPolicy({
        subject: "support-id",
        roles: ["support"],
        permissions: [AdminUsersReadPermission, AdminAuditReadPermission],
      }),
    ).toMatchObject({
      canAccessAdmin: false,
      canReadAudit: false,
      canReadUsers: false,
    });
  });

  it("ignores unknown admin permission strings while exposing catalog validation", () => {
    expect(isKnownAdminPermission("admin:unknown:read")).toBe(false);
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [AdminRole],
        permissions: ["admin:unknown:read", AdminRolesReadPermission],
      }),
    ).toMatchObject({
      canAccessAdmin: true,
      canReadRoles: true,
      canReadUsers: false,
    });
  });

  it("requires explicit manage/all permission for global admin management", () => {
    const abilityWithoutManageAll = createAdminAbility({
      subject: "admin-id",
      roles: [AdminRole],
      permissions: [AdminDashboardReadPermission],
    });
    const abilityWithManageAll = createAdminAbility({
      subject: "admin-id",
      roles: [AdminRole],
      permissions: [AdminManageAllPermission],
    });

    expect(
      canAdmin(abilityWithoutManageAll, AdminManageAction, AdminAllResource),
    ).toBe(false);
    expect(
      canAdmin(abilityWithManageAll, AdminManageAction, AdminAllResource),
    ).toBe(true);
    expect(canAdmin(abilityWithManageAll, "read", "admin.audit")).toBe(true);
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [AdminRole],
        permissions: [AdminManageAllPermission],
      }).canAccessAdmin,
    ).toBe(true);
  });

  it("builds a safe admin profile view and rejects missing permission", () => {
    expect(toAdminProfileView(adminPrincipal)).toEqual({
      id: "admin-id",
      email: "admin@example.com",
      displayName: "Ada Admin",
      locale: "ru",
      roles: [AdminRole],
      permissions: [AdminProfileReadPermission, AdminDashboardReadPermission],
    });
    expect(assertAdminProfilePermission(adminPrincipal)).toBe(adminPrincipal);
    expect(() =>
      assertAdminProfilePermission({
        subject: "admin-id",
        roles: [AdminRole],
        permissions: [],
      }),
    ).toThrow("Admin profile permission is required.");
  });
});
