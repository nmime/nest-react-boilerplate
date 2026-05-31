import { describe, expect, it } from "vitest";
import {
  ADMIN_DASHBOARD_READ_PERMISSION,
  ADMIN_PROFILE_READ_PERMISSION,
  createDefaultAccessPolicy,
  DEFAULT_AUTH_TENANT_ID,
  normalizeUserThemePreference,
  USER_PROFILE_READ_PERMISSION,
  toAuthenticatedUserView,
  USER_ROLE,
  ADMIN_ROLE,
} from "./index";

describe("auth shared", () => {
  it("creates default user and bootstrap admin access policies", () => {
    expect(createDefaultAccessPolicy("user@example.com", {})).toEqual({
      roles: [USER_ROLE],
      permissions: [USER_PROFILE_READ_PERMISSION],
    });
    expect(
      createDefaultAccessPolicy("Admin@Example.com", {
        ADMIN_BOOTSTRAP_EMAILS: "admin@example.com,other@example.com",
      }),
    ).toEqual({
      roles: [USER_ROLE],
      permissions: [USER_PROFILE_READ_PERMISSION],
    });
    expect(
      createDefaultAccessPolicy("Admin@Example.com", {
        ADMIN_BOOTSTRAP_ENABLED: "true",
        ADMIN_BOOTSTRAP_EMAILS: "admin@example.com,other@example.com",
      }),
    ).toEqual({
      roles: [USER_ROLE, ADMIN_ROLE],
      permissions: [
        USER_PROFILE_READ_PERMISSION,
        ADMIN_PROFILE_READ_PERMISSION,
        ADMIN_DASHBOARD_READ_PERMISSION,
      ],
    });
  });

  it("normalizes authenticated user views", () => {
    expect(
      toAuthenticatedUserView({
        id: "id",
        email: "user@example.com",
        displayName: "User",
        locale: "ru",
        theme: "dark",
        roles: ["user", "user"],
        permissions: ["profile:read", ""],
      }),
    ).toEqual({
      id: "id",
      tenantId: DEFAULT_AUTH_TENANT_ID,
      email: "user@example.com",
      displayName: "User",
      locale: "ru",
      theme: "dark",
      roles: ["user"],
      permissions: ["profile:read"],
    });
    expect(toAuthenticatedUserView({ id: "id", email: "e" })).toEqual({
      id: "id",
      tenantId: DEFAULT_AUTH_TENANT_ID,
      email: "e",
      theme: "system",
      roles: [],
      permissions: [],
    });
  });

  it("normalizes supported theme preferences", () => {
    expect(normalizeUserThemePreference("Dark")).toBe("dark");
    expect(normalizeUserThemePreference("system")).toBe("system");
    expect(normalizeUserThemePreference("sepia")).toBeUndefined();
  });
});
