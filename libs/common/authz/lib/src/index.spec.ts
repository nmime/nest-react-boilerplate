import { describe, expect, it } from "vitest";
import {
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminRolesWritePermission,
  AdminSettingsUpdatePermission,
  UserProfileReadPermission,
  UserRole,
  defaultRolePermissions,
  isKnownPermission,
  normalizeStringList,
  permissionCatalog,
  permissionToAbilityTarget,
  permissionsForRoles,
  roleKeys,
} from "./index";

describe("@app/common-authz normalizeStringList", () => {
  it("returns an empty list for non-array input (fail closed)", () => {
    expect(normalizeStringList("admin")).toEqual([]);
    expect(normalizeStringList(undefined)).toEqual([]);
    expect(normalizeStringList(null)).toEqual([]);
    expect(normalizeStringList(42)).toEqual([]);
  });

  it("trims, drops empties/non-strings, and de-duplicates array input", () => {
    expect(
      normalizeStringList([" admin ", "", "admin", null, 7, "user"]),
    ).toEqual(["admin", "user"]);
  });
});

describe("@app/common-authz permission catalog", () => {
  it("exposes the reconciled 13-permission catalog", () => {
    expect(permissionCatalog.map((entry) => entry.key)).toEqual([
      UserProfileReadPermission,
      AdminDashboardReadPermission,
      AdminProfileReadPermission,
      "admin:users:read",
      "admin:users:write",
      "admin:users:status:update",
      "admin:users:access-policy:update",
      "admin:roles:read",
      AdminRolesWritePermission,
      "admin:audit:read",
      "admin:settings:read",
      AdminSettingsUpdatePermission,
      AdminManageAllPermission,
    ]);
  });

  it("carries resource/action/description metadata for every entry", () => {
    for (const entry of permissionCatalog) {
      expect(entry.resource.length).toBeGreaterThan(0);
      expect(entry.action.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("recognizes known permissions and rejects unknown ones", () => {
    expect(isKnownPermission(AdminManageAllPermission)).toBe(true);
    expect(isKnownPermission(AdminRolesWritePermission)).toBe(true);
    expect(isKnownPermission("admin:unknown:read")).toBe(false);
  });

  it("maps permissions to framework-neutral ability targets", () => {
    expect(permissionToAbilityTarget(AdminProfileReadPermission)).toEqual({
      action: "read",
      resource: "admin.profile",
    });
    expect(permissionToAbilityTarget(AdminManageAllPermission)).toEqual({
      action: "manage",
      resource: "all",
    });
    expect(permissionToAbilityTarget(UserProfileReadPermission)).toEqual({
      action: "read",
      resource: "profile",
    });
    expect(permissionToAbilityTarget("admin:unknown:read")).toBeUndefined();
  });
});

describe("@app/common-authz role matrix", () => {
  it("enumerates the supported role keys", () => {
    expect(roleKeys).toEqual([UserRole, AdminRole]);
  });

  it("grants the user role read-only profile access", () => {
    expect(defaultRolePermissions[UserRole]).toEqual([
      UserProfileReadPermission,
    ]);
  });

  it("grants the admin role the full admin catalog including manage-all and roles:write", () => {
    expect(defaultRolePermissions[AdminRole]).toContain(
      AdminManageAllPermission,
    );
    expect(defaultRolePermissions[AdminRole]).toContain(
      AdminRolesWritePermission,
    );
    expect(defaultRolePermissions[AdminRole]).not.toContain(
      UserProfileReadPermission,
    );
  });

  it("unions role grants for bootstrap principals and ignores unknown roles", () => {
    expect(permissionsForRoles([UserRole, AdminRole])).toEqual([
      UserProfileReadPermission,
      AdminDashboardReadPermission,
      AdminProfileReadPermission,
      "admin:users:read",
      "admin:users:write",
      "admin:users:status:update",
      "admin:users:access-policy:update",
      "admin:roles:read",
      AdminRolesWritePermission,
      "admin:audit:read",
      "admin:settings:read",
      AdminSettingsUpdatePermission,
      AdminManageAllPermission,
    ]);
    expect(permissionsForRoles([UserRole])).toEqual([
      UserProfileReadPermission,
    ]);
    expect(permissionsForRoles(["support"])).toEqual([]);
    expect(permissionsForRoles([])).toEqual([]);
  });
});
