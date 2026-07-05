import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAdminAccess,
  normalizeClaimList,
} from "../entities/admin-session";
import {
  getBrowserPath,
  stripSensitiveBrowserTokenParams,
} from "../features/admin-auth";
import { toUserListParams } from "../features/user-filtering";
import {
  errorText,
  fallbackTranslate,
  formatDate,
  isUsersRoute,
  join,
  normalizeAdminPath,
  paramsFromPath,
  pageSize,
  routeUserId,
  totalPages,
} from "../shared";

describe("shared helpers", () => {
  it("returns the fallback translation when the error is not an Error instance", () => {
    expect(
      errorText(
        "plain string",
        "admin.users.error.requestFailed",
        fallbackTranslate,
      ),
    ).toBe("Users request failed");
    expect(
      errorText(
        new Error("boom"),
        "admin.users.error.requestFailed",
        fallbackTranslate,
      ),
    ).toBe("boom");
  });

  it("joins string lists and falls back to an em dash for empty/absent lists", () => {
    expect(join(["a", "b"])).toBe("a, b");
    expect(join([])).toBe("—");
    expect(join()).toBe("—");
  });

  it("formats dates and falls back to an em dash when absent", () => {
    expect(formatDate("2026-01-01T00:00:00.000Z")).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(formatDate()).toBe("—");
  });

  it("computes total pages with a floor of one", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(25, 10)).toBe(3);
    expect(totalPages()).toBe(1);
  });

  it("normalizes reverse-proxy and root admin paths", () => {
    expect(normalizeAdminPath("")).toBe("/");
    expect(normalizeAdminPath("/")).toBe("/");
    expect(normalizeAdminPath("/admin")).toBe("/");
    expect(normalizeAdminPath("/admin/")).toBe("/");
    expect(normalizeAdminPath("/admin/users")).toBe("/users");
    expect(normalizeAdminPath("/admin/users/u-1?panel=x")).toBe("/users/u-1");
    expect(normalizeAdminPath("/roles")).toBe("/roles");
  });

  it("detects user routes and extracts the route user id", () => {
    expect(isUsersRoute("/admin/users")).toBe(true);
    expect(isUsersRoute("/admin/users/u-1")).toBe(true);
    expect(isUsersRoute("/admin/roles")).toBe(false);
    expect(routeUserId("/admin/users/u-1?panel=x")).toBe("u-1");
    expect(routeUserId("/admin/users")).toBeUndefined();
  });

  it("reads query params from a path with or without a query string", () => {
    expect(paramsFromPath("/x?a=1&b=2").get("a")).toBe("1");
    expect([...paramsFromPath("/x").keys()]).toHaveLength(0);
  });

  it("maps user list filters to a generated query, dropping the all sentinel", () => {
    expect(
      toUserListParams({
        page: 3,
        permission: "all",
        role: "all",
        search: "  ",
        status: "all",
      }),
    ).toEqual({
      limit: pageSize,
      offset: 2 * pageSize,
      search: undefined,
      status: undefined,
      role: undefined,
      permission: undefined,
    });
    expect(
      toUserListParams({
        page: 0,
        permission: "admin:users:read",
        role: "admin",
        search: " ada ",
        status: "active",
      }),
    ).toEqual({
      limit: pageSize,
      offset: 0,
      search: "ada",
      status: "active",
      role: "admin",
      permission: "admin:users:read",
    });
  });
});

describe("admin RBAC claim normalization", () => {
  it("returns an empty list for non-array or absent claims", () => {
    expect(normalizeClaimList(undefined)).toEqual([]);
    expect(normalizeClaimList("not-an-array")).toEqual([]);
    expect(normalizeClaimList(["a", "a", "", 1, "b"])).toEqual(["a", "b"]);
  });

  it("builds a fail-closed access policy when no principal is supplied", () => {
    const access = createAdminAccess();
    expect(access.roles).toEqual([]);
    expect(access.permissions).toEqual([]);
    expect(access.canAccessAdmin).toBe(false);
  });
});

describe("admin browser bootstrap without a window", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips token stripping and returns the root path in non-browser contexts", () => {
    vi.stubGlobal("window", undefined);

    expect(() => {
      stripSensitiveBrowserTokenParams();
    }).not.toThrow();
    expect(getBrowserPath()).toBe("/");
  });
});
