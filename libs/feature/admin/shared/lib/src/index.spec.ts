import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@app/feature-auth-shared";
import {
  ADMIN_DASHBOARD_READ_PERMISSION,
  ADMIN_PROFILE_READ_PERMISSION,
  assertAdminProfilePermission,
  createAdminAccessPolicy,
  toAdminProfileView,
} from "./index";

const adminPrincipal: AuthenticatedPrincipal = {
  subject: "admin-id",
  email: "admin@example.com",
  displayName: "Ada Admin",
  locale: "es",
  roles: ["admin", "admin"],
  permissions: [ADMIN_PROFILE_READ_PERMISSION, ADMIN_DASHBOARD_READ_PERMISSION],
};

describe("@app/feature-admin-shared", () => {
  it("grants profile and dashboard access for admin principals", () => {
    expect(createAdminAccessPolicy(adminPrincipal)).toEqual({
      isAuthenticated: true,
      roles: ["admin"],
      permissions: [
        ADMIN_PROFILE_READ_PERMISSION,
        ADMIN_DASHBOARD_READ_PERMISSION,
      ],
      canAccessAdmin: true,
      canReadDashboard: true,
      canReadProfile: true,
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
    });
    expect(
      createAdminAccessPolicy({
        subject: "support-id",
        roles: ["support"],
        permissions: [ADMIN_PROFILE_READ_PERMISSION],
      }),
    ).toMatchObject({ canAccessAdmin: false, canReadProfile: false });
  });

  it("requires granular admin permissions without fallback claims", () => {
    expect(
      createAdminAccessPolicy({
        subject: "admin-id",
        roles: ["admin"],
        permissions: ["admin:read"],
      }),
    ).toMatchObject({
      canAccessAdmin: false,
      canReadDashboard: false,
      canReadProfile: false,
    });
  });

  it("builds a safe admin profile view and rejects missing permission", () => {
    expect(toAdminProfileView(adminPrincipal)).toEqual({
      id: "admin-id",
      email: "admin@example.com",
      displayName: "Ada Admin",
      locale: "es",
      roles: ["admin"],
      permissions: [
        ADMIN_PROFILE_READ_PERMISSION,
        ADMIN_DASHBOARD_READ_PERMISSION,
      ],
    });
    expect(assertAdminProfilePermission(adminPrincipal)).toBe(adminPrincipal);
    expect(() =>
      assertAdminProfilePermission({
        subject: "admin-id",
        roles: ["admin"],
        permissions: [],
      }),
    ).toThrow("Admin profile permission is required.");
  });
});
