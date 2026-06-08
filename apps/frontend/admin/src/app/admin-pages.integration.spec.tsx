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
import { renderAdminRoute } from "../App";
import { AdminLayout } from "../widgets/admin-shell";

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
};

describe("admin pages integration", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders dashboard summary, profile, and health/live/ready statuses from real endpoints", async () => {
    vi.spyOn(adminApi, "adminDashboardControllerSummary").mockResolvedValue({
      data: {
        totals: { users: 42, tenants: 3, activeSessions: 7 },
        health: { status: "ready", live: "ok", ready: "ok" },
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, "adminProfileControllerMe").mockResolvedValue({
      data: payload,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const renderRoute = (path: string) => {
      cleanup();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AdminLayout access={adminAccess} currentPath={path}>
            {renderAdminRoute(
              path,
              { status: "ready", payload, access: adminAccess },
              undefined,
              {
                requestOptions: { authToken: "token", baseUrl: "http://admin" },
              },
            )}
          </AdminLayout>
        </QueryClientProvider>,
      );
    };

    renderRoute("/admin");
    expect(await screen.findByText("42")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText("ok")).toBeTruthy();

    renderRoute("/admin/profile");
    expect(screen.getByText("Ada Admin")).toBeTruthy();
    expect(screen.getByText("admin@example.com")).toBeTruthy();
  });

  it("lists users, opens detail, searches, filters, paginates, and sends mutation bodies", async () => {
    const listSpy = vi
      .spyOn(adminApi, "adminUsersControllerList")
      .mockResolvedValue({
        data: {
          items: [user],
          total: 12,
          page: 1,
          limit: 10,
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    const detailSpy = vi
      .spyOn(adminApi, "adminUsersControllerDetail")
      .mockResolvedValue({
        data: user,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    const statusSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateStatus")
      .mockResolvedValue({
        data: { ...user, status: "disabled" },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    const accessSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateAccessPolicy")
      .mockResolvedValue({
        data: { ...user, roles: ["admin"], permissions: ["admin:users:read"] },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminLayout access={adminAccess} currentPath="/admin/users">
          {renderAdminRoute("/admin/users", {
            status: "ready",
            payload,
            access: adminAccess,
          })}
        </AdminLayout>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("user@example.com")).toBeTruthy();
    fireEvent.click(screen.getByText("user@example.com"));
    expect(await screen.findByText("Tenant tenant-1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "ada" },
    });
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "disabled" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Permission"), {
      target: { value: "admin:users:read" },
    });
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          search: "ada",
          status: "disabled",
          role: "admin",
          permission: "admin:users:read",
        }),
      ),
    );

    fireEvent.click(screen.getByText("Disable"));
    await waitFor(() =>
      expect(statusSpy).toHaveBeenCalledWith(
        "user-1",
        { status: "disabled" },
        undefined,
      ),
    );

    fireEvent.click(screen.getByText("Save access policy"));
    await waitFor(() =>
      expect(accessSpy).toHaveBeenCalledWith(
        "user-1",
        { permissions: ["profile:read"], roles: ["user"] },
        undefined,
      ),
    );
    expect(detailSpy).toHaveBeenCalledWith("user-1", undefined);
  });

  it("renders roles matrix, audit list and audit empty state without fake data", async () => {
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const auditSpy = vi
      .spyOn(adminApi, "adminAuditControllerList")
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "audit-1",
              action: "user.disabled",
              actorId: "admin-id",
              createdAt: "2026-01-02T00:00:00.000Z",
              metadata: { userId: "user-1" },
              targetId: "user-1",
              targetType: "user",
            },
          ],
          total: 1,
          page: 1,
          limit: 10,
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: { items: [], total: 0, page: 1, limit: 10 },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

    render(
      <QueryClientProvider client={new QueryClient()}>
        {renderAdminRoute("/admin/roles", {
          status: "ready",
          payload,
          access: adminAccess,
        })}
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Administrator")).toBeTruthy();
    expect(screen.getByText("admin.users")).toBeTruthy();

    cleanup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        {renderAdminRoute("/admin/audit", {
          status: "ready",
          payload,
          access: adminAccess,
        })}
      </QueryClientProvider>,
    );
    expect(await screen.findByText("user.disabled")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();

    cleanup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        {renderAdminRoute("/admin/audit", {
          status: "ready",
          payload,
          access: adminAccess,
        })}
      </QueryClientProvider>,
    );
    expect(await screen.findByText("No audit events yet.")).toBeTruthy();
    expect(auditSpy).toHaveBeenCalledTimes(2);
  });

  it("covers profile, forbidden/loading/error/not-found, tenant roadmap and CASL hidden nav", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminLayout access={restrictedAccess} currentPath="/admin/users">
          {renderAdminRoute("/admin/users", {
            status: "ready",
            payload,
            access: restrictedAccess,
          })}
        </AdminLayout>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("Users")).toBeFalsy();
    expect(screen.getByText("Missing admin users permission")).toBeTruthy();

    cleanup();
    render(
      renderAdminRoute("/admin/tenants", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(screen.getByText("Tenant roadmap")).toBeTruthy();

    cleanup();
    render(
      renderAdminRoute("/admin/profile", {
        status: "ready",
        payload,
        access: { ...adminAccess, permissions: [] },
      }),
    );
    expect(screen.getByText("Missing admin profile permission")).toBeTruthy();

    cleanup();
    render(
      renderAdminRoute("/admin/missing", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(screen.getByText("Page not found")).toBeTruthy();

    cleanup();
    render(renderAdminRoute("/admin", { status: "loading" }));
    expect(screen.getByText("Loading admin profile")).toBeTruthy();
  });
});
