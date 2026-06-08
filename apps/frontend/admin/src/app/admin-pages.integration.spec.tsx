import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi, throwOnOpenApiErrorData } from "@app/api-client";
import { createAdminAccess } from "../entities/admin-session";
import { AdminLayout, renderAdminRoute } from "../pages";

const adminAccess = createAdminAccess({
  subject: "admin-id",
  roles: ["admin"],
  permissions: [
    "admin:dashboard:read",
    "admin:profile:read",
    "admin:users:read",
    "admin:users:status:update",
    "admin:users:access-policy:update",
    "admin:roles:read",
    "admin:audit:read",
  ],
});

const restrictedAccess = createAdminAccess({
  subject: "admin-id",
  roles: ["admin"],
  permissions: ["admin:dashboard:read", "admin:profile:read"],
});

const payload = {
  principal: {
    subject: "admin-id",
    email: "admin@example.com",
    roles: adminAccess.roles,
    permissions: adminAccess.permissions,
  },
  profile: {
    id: "admin-id",
    displayName: "Ada Admin",
    email: "admin@example.com",
  },
};

const user = {
  id: "user-1",
  tenantId: "tenant-1",
  email: "user@example.com",
  status: "active" as const,
  roles: ["user"],
  permissions: ["profile:read"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const rolesCatalog = {
  resources: ["admin.users"],
  roles: [
    {
      role: "user",
      label: "User",
      description: "User",
      permissions: ["profile:read"],
    },
    {
      role: "admin",
      label: "Administrator",
      description: "Admin",
      permissions: ["admin:users:read"],
    },
  ],
  permissions: [
    {
      permission: "profile:read",
      resource: "admin.profile",
      action: "read",
      description: "Profile",
    },
    {
      permission: "admin:users:read",
      resource: "admin.users",
      action: "read",
      description: "Users",
    },
  ],
  assignableRoles: ["user", "admin"],
  assignablePermissions: ["profile:read", "admin:users:read"],
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });

const renderAdmin = (path: string, fetchImpl = vi.fn()) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const ui = render(
    <QueryClientProvider client={client}>
      <AdminLayout access={adminAccess} currentPath={path}>
        {renderAdminRoute(
          path,
          { status: "ready", access: adminAccess, payload },
          undefined,
          { requestOptions: { baseUrl: "https://admin.example", fetchImpl } },
        )}
      </AdminLayout>
    </QueryClientProvider>,
  );

  return { client, ...ui };
};

const requests = (fetchImpl: ReturnType<typeof vi.fn>, pathname: string) =>
  fetchImpl.mock.calls
    .map((call) => call[0] as Request)
    .filter((request) => new URL(request.url).pathname === pathname);

const adminFetch = vi.fn((request: Request) => {
  const url = new URL(request.url);
  if (url.pathname === "/admin/dashboard/summary") {
    return Promise.resolve(
      jsonResponse({
        data: {
          totalUsers: 3,
          activeUsers: 2,
          disabledUsers: 1,
          invitedUsers: 0,
          recentAuditEvents: 4,
          recentAudit: [],
        },
      }),
    );
  }
  if (url.pathname === "/admin/users" && request.method === "GET") {
    return Promise.resolve(
      jsonResponse({
        data: { items: [user], total: 21, limit: 10, offset: 0 },
      }),
    );
  }
  if (url.pathname === "/admin/users/user-1" && request.method === "GET") {
    return Promise.resolve(jsonResponse({ data: user }));
  }
  if (url.pathname === "/admin/roles") {
    return Promise.resolve(jsonResponse({ data: rolesCatalog }));
  }
  if (url.pathname === "/admin/audit") {
    return Promise.resolve(
      jsonResponse({ data: { items: [], total: 0, limit: 10, offset: 0 } }),
    );
  }
  if (request.method === "PATCH") {
    return Promise.resolve(jsonResponse({ data: user }));
  }
  return Promise.resolve(new Response(null, { status: 200 }));
});

describe("admin current entities integration", () => {
  afterEach(() => {
    cleanup();
    adminFetch.mockClear();
    vi.restoreAllMocks();
  });

  it("renders dashboard summary, profile, and health/live/ready statuses from real endpoints", async () => {
    renderAdmin("/admin", adminFetch);

    expect(await screen.findByText("3")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    await waitFor(() =>
      expect(requests(adminFetch, "/health")).toHaveLength(1),
    );
    expect(requests(adminFetch, "/live")).toHaveLength(1);
    expect(requests(adminFetch, "/ready")).toHaveLength(1);
  });

  it("lists users, opens detail, searches, filters, paginates, and sends mutation bodies", async () => {
    renderAdmin("/admin/users?search=ada&status=active&page=2", adminFetch);
    expect(await screen.findByText("user@example.com")).toBeTruthy();
    fireEvent.click(screen.getByText("user@example.com"));
    await waitFor(() =>
      expect(requests(adminFetch, "/admin/users/user-1")).toHaveLength(1),
    );

    const listUrl = requests(adminFetch, "/admin/users")[0].url;
    expect(listUrl).toContain("limit=10");
    expect(listUrl).toContain("offset=10");
    expect(listUrl).toContain("search=ada");
    expect(listUrl).toContain("status=active");

    const mutationFetch = vi.fn((request: Request) => {
      expect(request.method).toBe("PATCH");
      return Promise.resolve(jsonResponse({ data: user }));
    });
    await throwOnOpenApiErrorData(
      adminApi.adminUsersControllerUpdateUserStatus(
        "user-1",
        { status: "disabled" },
        { baseUrl: "https://admin.example", fetchImpl: mutationFetch },
      ),
    );
    await throwOnOpenApiErrorData(
      adminApi.adminUsersControllerUpdateUserAccessPolicy(
        "user-1",
        { roles: ["admin"], permissions: ["admin:users:read"] },
        { baseUrl: "https://admin.example", fetchImpl: mutationFetch },
      ),
    );

    const statusRequest = mutationFetch.mock.calls[0][0];
    const policyRequest = mutationFetch.mock.calls[1][0];
    expect(await statusRequest.json()).toEqual({ status: "disabled" });
    expect(await policyRequest.json()).toEqual({
      roles: ["admin"],
      permissions: ["admin:users:read"],
    });
  });

  it("renders roles matrix, audit list and audit empty state without fake data", async () => {
    renderAdmin("/admin/roles", adminFetch);
    expect(await screen.findByText("admin:users:read")).toBeTruthy();
    cleanup();
    renderAdmin("/admin/audit", adminFetch);
    expect(await screen.findByText("No audit events")).toBeTruthy();
    expect(screen.getByText(/No client-side fake data/u)).toBeTruthy();
  });

  it("covers profile, forbidden/loading/error/not-found, tenant roadmap and CASL hidden nav", async () => {
    render(
      <AdminLayout access={restrictedAccess} currentPath="/admin/users">
        {renderAdminRoute("/admin/users", {
          status: "ready",
          access: restrictedAccess,
          payload,
        })}
      </AdminLayout>,
    );

    expect(screen.queryByText("Users")).toBeNull();
    expect(screen.getByRole("heading", { name: "Access denied" })).toBeTruthy();
    expect(screen.getByText("RBAC denied")).toBeTruthy();
    expect(screen.getByText("Missing admin users permission.")).toBeTruthy();
    cleanup();
    render(
      renderAdminRoute("/admin/tenants", {
        status: "ready",
        access: adminAccess,
        payload,
      }),
    );
    expect(screen.getByText("Tenant administration roadmap")).toBeTruthy();
    cleanup();
    render(
      renderAdminRoute("/admin/profile", {
        status: "ready",
        access: adminAccess,
        payload,
      }),
    );
    expect(screen.getByText("Ada Admin")).toBeTruthy();
    cleanup();
    render(
      renderAdminRoute("/admin/missing", {
        status: "ready",
        access: adminAccess,
        payload,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Admin page not found" }),
    ).toBeTruthy();
    expect(screen.getByText("Unknown route")).toBeTruthy();
    expect(screen.getByText("Choose dashboard or profile.")).toBeTruthy();
    cleanup();
    render(renderAdminRoute("/admin", { status: "loading" }));
    expect(screen.getAllByText("Loading admin profile...")).toHaveLength(2);
    cleanup();
    const failingFetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ detail: "boom" }, { status: 403 })),
    );
    await expect(
      throwOnOpenApiErrorData(
        adminApi.adminUsersControllerUpdateUserAccessPolicy(
          "user-1",
          { roles: ["admin"], permissions: ["admin:users:read"] },
          { baseUrl: "https://admin.example", fetchImpl: failingFetch },
        ),
      ),
    ).rejects.toThrow("boom");
  });
});
