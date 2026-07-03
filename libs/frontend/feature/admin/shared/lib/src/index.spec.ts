import { describe, expect, it } from "vitest";
import {
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersStatusUpdatePermission,
  createAdminAccessPolicy,
  assertCanReadAdminProfile,
  normalizeStringList,
} from "./index";

describe("@app/frontend-feature-admin-shared access policy", () => {
  it("derives a frontend-safe admin access policy from principal claims", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [AdminRole],
        permissions: [
          AdminProfileReadPermission,
          AdminDashboardReadPermission,
          AdminUsersStatusUpdatePermission,
          AdminUsersAccessPolicyUpdatePermission,
        ],
      }),
    ).toEqual({
      isAuthenticated: true,
      roles: [AdminRole],
      permissions: [
        AdminProfileReadPermission,
        AdminDashboardReadPermission,
        AdminUsersStatusUpdatePermission,
        AdminUsersAccessPolicyUpdatePermission,
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
        permissions: [AdminManageAllPermission],
        roles: [AdminRole],
      }).canAccessAdmin,
    ).toBe(false);
    expect(
      createAdminAccessPolicy({
        subject: "user-id",
        permissions: [AdminManageAllPermission],
        roles: ["user"],
      }).canAccessAdmin,
    ).toBe(false);
  });

  it("treats manage-all as a frontend-safe wildcard access claim", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: [AdminRole],
        permissions: [AdminManageAllPermission],
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
        roles: [AdminRole],
        permissions: [AdminProfileReadPermission],
      }),
    ).not.toThrow();
  });
});
