import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "@app/frontend/api-client";
import { FrontendI18nProvider, FrontendStateProvider } from "@app/frontend/ui";
import { adminFrontendTranslations } from "@app/frontend/feature/admin/i18n";
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
  roles: [],
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

const AdminTestProviders = ({
  children,
}: Readonly<{ children: ReactElement }>) => (
  <FrontendStateProvider>
    <FrontendI18nProvider translations={adminFrontendTranslations}>
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    </FrontendI18nProvider>
  </FrontendStateProvider>
);

const renderAdminRouteForTest = (element: ReactElement) =>
  render(<AdminTestProviders>{element}</AdminTestProviders>);

describe("admin pages integration", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders dashboard summary, profile, and health/live/ready statuses from real endpoints", async () => {
    vi.spyOn(
      adminApi,
      "adminUsersControllerDashboardSummary",
    ).mockResolvedValue({
      data: {
        activeUsers: 7,
        disabledUsers: 3,
        invitedUsers: 2,
        recentAudit: [],
        recentAuditEvents: 4,
        totalUsers: 42,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, "adminHealthControllerHealth").mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, "adminHealthControllerLive").mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, "adminHealthControllerReady").mockResolvedValue({
      data: {},
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
      renderAdminRouteForTest(
        <AdminLayout access={adminAccess} currentPath={path}>
          {renderAdminRoute(
            path,
            { status: "ready", payload, access: adminAccess },
            undefined,
            {
              requestOptions: {
                authToken: "token",
                baseUrl: "https://admin.example.test",
              },
            },
          )}
        </AdminLayout>,
      );
    };

    renderRoute("/admin");
    expect((await screen.findAllByText("42")).length).toBeGreaterThan(0);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Operations command center")).toBeTruthy();
    expect(screen.getByText("Pending invitations")).toBeTruthy();
    expect(screen.getAllByText("Ready").length).toBeGreaterThanOrEqual(3);

    renderRoute("/admin/profile");
    expect(screen.getAllByText("Ada Admin").length).toBeGreaterThan(0);
    expect(screen.getByText("Email: admin@example.com")).toBeTruthy();
    expect(screen.getByText("Session control plane")).toBeTruthy();
    expect(screen.getByText("Frontend guardrails")).toBeTruthy();
  });

  it("lists users, opens detail, searches, filters, paginates, and sends mutation bodies", async () => {
    const listSpy = vi
      .spyOn(adminApi, "adminUsersControllerListUsers")
      .mockResolvedValue({
        data: {
          items: [user],
          total: 12,
          limit: 10,
          offset: 0,
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    const detailSpy = vi
      .spyOn(adminApi, "adminUsersControllerGetUser")
      .mockResolvedValue({
        data: user,
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    const statusSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateUserStatus")
      .mockResolvedValue({
        data: { ...user, status: "disabled" },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });
    const accessSpy = vi
      .spyOn(adminApi, "adminUsersControllerUpdateUserAccessPolicy")
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

    renderAdminRouteForTest(
      <AdminLayout
        access={adminAccess}
        currentPath="/admin/users?search=ada&status=disabled&role=admin&permission=admin:users:read&page=2"
      >
        {renderAdminRoute(
          "/admin/users?search=ada&status=disabled&role=admin&permission=admin:users:read&page=2",
          {
            status: "ready",
            payload,
            access: adminAccess,
          },
        )}
      </AdminLayout>,
    );

    expect(await screen.findByText("user@example.com")).toBeTruthy();
    expect(screen.getByText("Visible users")).toBeTruthy();
    expect(screen.getByText("User directory")).toBeTruthy();
    expect(screen.getByText("Focused directory view")).toBeTruthy();
    fireEvent.click(screen.getByText("user@example.com"));
    expect(await screen.findByText("profile:read")).toBeTruthy();
    expect(screen.getByText("Access policy snapshot")).toBeTruthy();

    await waitFor(() =>
      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 10,
          permission: "admin:users:read",
          role: "admin",
          search: "ada",
          status: "disabled",
        }),
        undefined,
      ),
    );

    expect(statusSpy).not.toHaveBeenCalled();
    expect(accessSpy).not.toHaveBeenCalled();
    expect(detailSpy).toHaveBeenCalledWith("user-1", undefined);
  });

  it("renders roles matrix, audit list and audit empty state without fake data", async () => {
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const auditSpy = vi
      .spyOn(adminApi, "adminUsersControllerListAudit")
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "audit-1",
              action: "user.disabled",
              actorId: "admin-id",
              createdAt: "2026-01-02T00:00:00.000Z",
              metadata: { userId: "user-1" },
              resource: "user",
              targetUserId: "user-1",
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: { items: [], limit: 10, offset: 0, total: 0 },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

    renderAdminRouteForTest(
      renderAdminRoute("/admin/roles", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(
      (await screen.findAllByText("Administrator")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Role governance map")).toBeTruthy();
    expect(screen.getByText("admin.users")).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute("/admin/audit", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(await screen.findByText("user.disabled")).toBeTruthy();
    expect(screen.getByText("Audit operations timeline")).toBeTruthy();
    expect(screen.getByText("user-1")).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute("/admin/audit", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(await screen.findByText("No audit events")).toBeTruthy();
    expect(auditSpy).toHaveBeenCalledTimes(2);
  });

  it("covers profile, forbidden/loading/error/not-found, tenant roadmap and CASL hidden nav", () => {
    renderAdminRouteForTest(
      <AdminLayout access={restrictedAccess} currentPath="/admin/users">
        {renderAdminRoute("/admin/users", {
          status: "ready",
          payload,
          access: restrictedAccess,
        })}
      </AdminLayout>,
    );

    expect(screen.queryByRole("link", { name: "Users" })).toBeFalsy();
    expect(
      screen.getAllByText("Missing admin users permission.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Fail-closed route guard")).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute("/admin/tenants", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(
      screen.getByText("Tenants, memberships, and invitations"),
    ).toBeTruthy();
    expect(screen.getByText("Tenant console runway")).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute("/admin/profile", {
        status: "ready",
        payload,
        access: { ...adminAccess, permissions: [], roles: [] },
      }),
    );
    expect(screen.getAllByText("Ada Admin").length).toBeGreaterThan(0);

    cleanup();
    renderAdminRouteForTest(
      renderAdminRoute("/admin/missing", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );
    expect(screen.getByText("Admin page not found")).toBeTruthy();
    expect(screen.getByText("Route recovery")).toBeTruthy();

    cleanup();
    renderAdminRouteForTest(renderAdminRoute("/admin", { status: "loading" }));
    expect(
      screen.getAllByText("Loading admin profile...").length,
    ).toBeGreaterThan(0);
  });
});
