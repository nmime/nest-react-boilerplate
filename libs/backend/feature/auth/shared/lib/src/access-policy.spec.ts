import { describe, expect, it } from "vitest";
import {
  AdminManageAllPermission,
  AdminRole,
  UserProfileReadPermission,
  UserRole,
  createDefaultAccessPolicy,
  isAdminBootstrapAllowed,
  orderPermissionKeys,
  orderRoleKeys,
  permissionsForRoles,
  resolveBootstrapRoleKeys,
} from "./access-policy";
import { DefaultAuthTenantId } from "./oauth";

const allowlistedTenantId = "11111111-1111-4111-8111-111111111111";

describe("access policy bootstrap roles", () => {
  it("grants only the user role by default", () => {
    expect(resolveBootstrapRoleKeys("member@example.com", {})).toEqual([
      UserRole,
    ]);
  });

  it("adds the admin role for bootstrap-allowlisted emails", () => {
    expect(
      resolveBootstrapRoleKeys("Admin@Example.com", {
        ADMIN_BOOTSTRAP_ENABLED: "true",
        ADMIN_BOOTSTRAP_EMAILS: "admin@example.com",
      }),
    ).toEqual([UserRole, AdminRole]);
  });

  it("keeps enabled bootstrap closed for non-allowlisted emails", () => {
    expect(
      isAdminBootstrapAllowed("member@example.com", DefaultAuthTenantId, {
        ADMIN_BOOTSTRAP_ENABLED: "true",
        ADMIN_BOOTSTRAP_EMAILS: "admin@example.com",
      }),
    ).toBe(false);
  });

  it("honours the tenant allowlist for admin bootstrap", () => {
    const env = {
      ADMIN_BOOTSTRAP_ENABLED: "true",
      ADMIN_BOOTSTRAP_EMAILS: "admin@example.com",
      ADMIN_BOOTSTRAP_TENANT_IDS: allowlistedTenantId,
    };
    expect(
      isAdminBootstrapAllowed("admin@example.com", allowlistedTenantId, env),
    ).toBe(true);
    expect(
      isAdminBootstrapAllowed(
        "admin@example.com",
        "22222222-2222-4222-8222-222222222222",
        env,
      ),
    ).toBe(false);
    expect(
      resolveBootstrapRoleKeys("admin@example.com", env, allowlistedTenantId),
    ).toEqual([UserRole, AdminRole]);
  });

  it("keeps createDefaultAccessPolicy deriving permissions from the role keys", () => {
    expect(createDefaultAccessPolicy("member@example.com", {})).toEqual({
      roles: resolveBootstrapRoleKeys("member@example.com", {}),
      permissions: permissionsForRoles([UserRole]),
    });
  });
});

describe("canonical RBAC ordering", () => {
  it("orders role keys by the system role catalog, appending unknowns", () => {
    expect(orderRoleKeys([AdminRole, "zeta", UserRole, AdminRole])).toEqual([
      UserRole,
      AdminRole,
      "zeta",
    ]);
  });

  it("orders permission keys by catalog index and appends unknowns alphabetically", () => {
    expect(
      orderPermissionKeys([
        AdminManageAllPermission,
        "zzz:unknown",
        UserProfileReadPermission,
        "aaa:unknown",
      ]),
    ).toEqual([
      UserProfileReadPermission,
      AdminManageAllPermission,
      "aaa:unknown",
      "zzz:unknown",
    ]);
  });

  it("is the identity for the seeded matrix so the jsonb cache stays identical", () => {
    const matrixPermissions = permissionsForRoles([UserRole, AdminRole]);
    // Feeding the matrix output back through the canonical ordering used by the
    // effective-permission resolver must reproduce it byte for byte.
    expect(orderPermissionKeys(matrixPermissions)).toEqual(matrixPermissions);
    expect(orderRoleKeys([AdminRole, UserRole])).toEqual([UserRole, AdminRole]);
    expect(DefaultAuthTenantId).toBe("00000000-0000-0000-0000-000000000000");
  });
});
