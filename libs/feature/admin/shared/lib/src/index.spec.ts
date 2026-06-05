import { describe, expect, it } from "vitest";
import {
  ADMIN_AUDIT_READ_PERMISSION,
  ADMIN_DASHBOARD_READ_PERMISSION,
  ADMIN_MANAGE_ACTION,
  ADMIN_MANAGE_ALL_PERMISSION,
  ADMIN_ALL_RESOURCE,
  ADMIN_PROFILE_READ_PERMISSION,
  ADMIN_ROLE,
  ADMIN_ROLES_READ_PERMISSION,
  ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
  ADMIN_USERS_READ_PERMISSION,
  ADMIN_USERS_STATUS_UPDATE_PERMISSION,
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
  roles: [ADMIN_ROLE, ADMIN_ROLE],
  permissions: [ADMIN_PROFILE_READ_PERMISSION, ADMIN_DASHBOARD_READ_PERMISSION],
};

describe("@app/feature-admin-shared CASL RBAC", () => {
  it("derives an admin CASL ability from explicit RBAC roles and permissions", () => {
    const ability = createAdminAbility({
      subject: "admin-id",
      roles: [ADMIN_ROLE],
      permissions: [
        ADMIN_DASHBOARD_READ_PERMISSION,
        ADMIN_USERS_READ_PERMISSION,
        ADMIN_USERS_STATUS_UPDATE_PERMISSION,
        ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
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
      roles: [ADMIN_ROLE],
      permissions: [
        ADMIN_PROFILE_READ_PERMISSION,
        ADMIN_DASHBOARD_READ_PERMISSION,
      ],
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
        permissions: [ADMIN_PROFILE_READ_PERMISSION],
      }),
    ).toMatchObject({ canAccessAdmin: false, canReadProfile: false });
  });

  it("denies admin role alone without explicit permissions", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [ADMIN_ROLE],
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
        permissions: [ADMIN_USERS_READ_PERMISSION, ADMIN_AUDIT_READ_PERMISSION],
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
        roles: [ADMIN_ROLE],
        permissions: ["admin:unknown:read", ADMIN_ROLES_READ_PERMISSION],
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
      roles: [ADMIN_ROLE],
      permissions: [ADMIN_DASHBOARD_READ_PERMISSION],
    });
    const abilityWithManageAll = createAdminAbility({
      subject: "admin-id",
      roles: [ADMIN_ROLE],
      permissions: [ADMIN_MANAGE_ALL_PERMISSION],
    });

    expect(
      canAdmin(
        abilityWithoutManageAll,
        ADMIN_MANAGE_ACTION,
        ADMIN_ALL_RESOURCE,
      ),
    ).toBe(false);
    expect(
      canAdmin(abilityWithManageAll, ADMIN_MANAGE_ACTION, ADMIN_ALL_RESOURCE),
    ).toBe(true);
    expect(canAdmin(abilityWithManageAll, "read", "admin.audit")).toBe(true);
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [ADMIN_ROLE],
        permissions: [ADMIN_MANAGE_ALL_PERMISSION],
      }).canAccessAdmin,
    ).toBe(true);
  });

  it("builds a safe admin profile view and rejects missing permission", () => {
    expect(toAdminProfileView(adminPrincipal)).toEqual({
      id: "admin-id",
      email: "admin@example.com",
      displayName: "Ada Admin",
      locale: "ru",
      roles: [ADMIN_ROLE],
      permissions: [
        ADMIN_PROFILE_READ_PERMISSION,
        ADMIN_DASHBOARD_READ_PERMISSION,
      ],
    });
    expect(assertAdminProfilePermission(adminPrincipal)).toBe(adminPrincipal);
    expect(() =>
      assertAdminProfilePermission({
        subject: "admin-id",
        roles: [ADMIN_ROLE],
        permissions: [],
      }),
    ).toThrow("Admin profile permission is required.");
  });
});
