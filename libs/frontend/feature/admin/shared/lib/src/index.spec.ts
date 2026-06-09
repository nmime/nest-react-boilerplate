import { describe, expect, it } from "vitest";
import {
  ADMIN_DASHBOARD_READ_PERMISSION,
  ADMIN_MANAGE_ALL_PERMISSION,
  ADMIN_PROFILE_READ_PERMISSION,
  ADMIN_ROLE,
  ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
  ADMIN_USERS_STATUS_UPDATE_PERMISSION,
  createAdminAccessPolicy,
  assertCanReadAdminProfile,
  normalizeStringList,
} from "./index";

describe("@app/frontend/feature-admin-shared access policy", () => {
  it("derives a frontend-safe admin access policy from principal claims", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [ADMIN_ROLE],
        permissions: [
          ADMIN_PROFILE_READ_PERMISSION,
          ADMIN_DASHBOARD_READ_PERMISSION,
          ADMIN_USERS_STATUS_UPDATE_PERMISSION,
          ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
        ],
      }),
    ).toEqual({
      isAuthenticated: true,
      roles: [ADMIN_ROLE],
      permissions: [
        ADMIN_PROFILE_READ_PERMISSION,
        ADMIN_DASHBOARD_READ_PERMISSION,
        ADMIN_USERS_STATUS_UPDATE_PERMISSION,
        ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
      ],
      canAccessAdmin: true,
      canReadProfile: true,
      canReadDashboard: true,
      canReadUsers: false,
      canUpdateUserStatus: true,
      canUpdateUserAccessPolicy: true,
      canReadRoles: false,
      canReadAudit: false,
      canReadSettings: false,
      canUpdateSettings: false,
    });
  });

  it("fails closed when subject or admin role is missing", () => {
    expect(
      createAdminAccessPolicy({
        permissions: [ADMIN_MANAGE_ALL_PERMISSION],
        roles: [ADMIN_ROLE],
      }).canAccessAdmin,
    ).toBe(false);
    expect(
      createAdminAccessPolicy({
        subject: "user-id",
        permissions: [ADMIN_MANAGE_ALL_PERMISSION],
        roles: ["user"],
      }).canAccessAdmin,
    ).toBe(false);
  });

  it("treats manage-all as a frontend-safe wildcard access claim", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [ADMIN_ROLE],
        permissions: [ADMIN_MANAGE_ALL_PERMISSION],
      }),
    ).toMatchObject({
      canAccessAdmin: true,
      canReadProfile: true,
      canReadDashboard: true,
      canReadUsers: true,
      canUpdateUserStatus: true,
      canUpdateUserAccessPolicy: true,
      canReadRoles: true,
      canReadAudit: true,
      canReadSettings: true,
      canUpdateSettings: true,
    });
  });

  it("normalizes claim lists", () => {
    expect(normalizeStringList([" admin ", "", "admin", null])).toEqual([
      "admin",
    ]);
  });

  it("throws when the principal cannot read the admin profile", () => {
    expect(() => assertCanReadAdminProfile()).toThrow(
      "Admin profile permission is required.",
    );
    expect(() =>
      assertCanReadAdminProfile({
        subject: "admin-id",
        roles: [ADMIN_ROLE],
        permissions: [ADMIN_PROFILE_READ_PERMISSION],
      }),
    ).not.toThrow();
  });
});
