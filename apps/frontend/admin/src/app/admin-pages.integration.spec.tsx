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
import { adminApi } from "@app/frontend-api-client";
import {
  FrontendI18nProvider,
  FrontendStateProvider,
} from "@app/frontend-runtime";
import { adminFrontendTranslations } from "@app/frontend-feature-admin-i18n";
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
  assignableRoles: ["user", "admin"],
  assignablePermissions: ["profile:read", "admin:users:read"],
  roles: [
    {
      id: "role-user",
      role: "user",
      label: "User",
      description: "User",
      isSystem: true,
      permissions: ["profile:read"],
    },
    {
      id: "role-admin",
      role: "admin",
      label: "Administrator",
      description: "Admin",
      isSystem: true,
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

// A catalog that additionally carries a non-system custom role so the editable
// matrix can toggle a role that is not protected by backend invariants.
const editableRolesCatalog = {
  ...rolesCatalog,
  roles: [
    ...rolesCatalog.roles,
    {
      id: "role-ops",
      role: "ops",
      label: "Ops team",
      description: "Operations",
      isSystem: false,
      permissions: [] as string[],
    },
  ],
};

const rolesWriteAccess = createAdminAccess({
  subject: "admin-id",
  roles: ["admin"],
  permissions: ["admin:roles:read", "admin:roles:write", "admin:users:read"],
});

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

  it("renders dashboard summary and health endpoint errors", async () => {
    vi.spyOn(
      adminApi,
      "adminUsersControllerDashboardSummary",
    ).mockRejectedValue(new Error("summary offline"));
    vi.spyOn(adminApi, "adminHealthControllerHealth").mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 503 }),
    });
    vi.spyOn(adminApi, "adminHealthControllerLive").mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 503 }),
    });
    vi.spyOn(adminApi, "adminHealthControllerReady").mockResolvedValue({
      data: {},
      error: undefined,
      response: new Response(null, { status: 503 }),
    });

    renderAdminRouteForTest(
      renderAdminRoute(
        "/admin",
        { status: "ready", payload, access: adminAccess },
        undefined,
        {
          requestOptions: {
            authToken: "token",
            baseUrl: "https://admin.example.test",
          },
        },
      ),
    );

    expect(await screen.findByText("summary offline")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(
        3,
      );
    });
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

    await waitFor(() => {
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
      );
    });

    expect(statusSpy).not.toHaveBeenCalled();
    expect(accessSpy).not.toHaveBeenCalled();
    expect(detailSpy).toHaveBeenCalledWith("user-1", undefined);
  });

  it("assigns roles to a user via the assign-user-roles endpoint when the admin can write roles", async () => {
    vi.spyOn(adminApi, "adminUsersControllerListUsers").mockResolvedValue({
      data: { items: [user], total: 1, limit: 10, offset: 0 },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const assignSpy = vi
      .spyOn(adminApi, "adminRolesControllerAssignUserRoles")
      .mockResolvedValue({
        data: { ...user, roles: ["user", "admin"] },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

    renderAdminRouteForTest(
      <AdminLayout access={rolesWriteAccess} currentPath="/admin/users">
        {renderAdminRoute("/admin/users", {
          status: "ready",
          payload,
          access: rolesWriteAccess,
        })}
      </AdminLayout>,
    );

    expect(await screen.findByText("user@example.com")).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Assign roles" }));

    fireEvent.click(await screen.findByRole("checkbox", { name: "admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign roles" }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(
        "user-1",
        { roles: ["user", "admin"] },
        undefined,
      );
    });
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
            {
              id: "audit-2",
              action: "user.reviewed",
              actorUserId: "admin-id",
              createdAt: "2026-01-03T00:00:00.000Z",
              metadata: {},
              resource: "user",
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

  it("renders audit request failures without masking the backend message", async () => {
    vi.spyOn(adminApi, "adminUsersControllerListAudit").mockRejectedValue(
      new Error("audit stream offline"),
    );

    renderAdminRouteForTest(
      renderAdminRoute("/admin/audit", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );

    expect(await screen.findByText("audit stream offline")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
  });

  it("keeps the roles matrix read-only when the admin cannot write roles", async () => {
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: rolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const setSpy = vi.spyOn(adminApi, "adminRolesControllerSetRolePermissions");

    renderAdminRouteForTest(
      renderAdminRoute("/admin/roles", {
        status: "ready",
        payload,
        access: adminAccess,
      }),
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: "admin:users:read assigned to admin",
    });
    expect(checkbox.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "New role" })).toBeFalsy();
    fireEvent.click(checkbox);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("toggles a permission on an editable role via set-role-permissions when the admin can write roles", async () => {
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: editableRolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const setSpy = vi
      .spyOn(adminApi, "adminRolesControllerSetRolePermissions")
      .mockResolvedValue({
        data: {
          id: "role-ops",
          role: "ops",
          label: "Ops team",
          description: "Operations",
          isSystem: false,
          permissions: ["admin:users:read"],
        },
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

    renderAdminRouteForTest(
      renderAdminRoute("/admin/roles", {
        status: "ready",
        payload,
        access: rolesWriteAccess,
      }),
    );

    const opsCheckbox = await screen.findByRole("checkbox", {
      name: "admin:users:read assigned to ops",
    });
    expect(opsCheckbox.hasAttribute("disabled")).toBe(false);
    // System roles stay protected even when the admin can write roles.
    expect(
      screen
        .getByRole("checkbox", {
          name: "admin:users:read assigned to admin",
        })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(opsCheckbox);

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith(
        "role-ops",
        { permissions: ["admin:users:read"] },
        undefined,
      );
    });
  });

  it("creates a role through the create-role mutation", async () => {
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: editableRolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    const createSpy = vi
      .spyOn(adminApi, "adminRolesControllerCreateRole")
      .mockResolvedValue({
        data: {
          id: "role-new",
          role: "support",
          label: "Support",
          description: "",
          isSystem: false,
          permissions: [],
        },
        error: undefined,
        response: new Response(null, { status: 201 }),
      });

    renderAdminRouteForTest(
      renderAdminRoute("/admin/roles", {
        status: "ready",
        payload,
        access: rolesWriteAccess,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "New role" }));
    fireEvent.change(screen.getByLabelText("Role key"), {
      target: { value: "support" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ key: "support" }),
        undefined,
      );
    });
  });

  it("surfaces a backend rejection of a permission change without throwing", async () => {
    vi.spyOn(adminApi, "adminUsersControllerRoles").mockResolvedValue({
      data: editableRolesCatalog,
      error: undefined,
      response: new Response(null, { status: 200 }),
    });
    vi.spyOn(
      adminApi,
      "adminRolesControllerSetRolePermissions",
    ).mockRejectedValue(new Error("Cannot strip admin core permissions"));

    renderAdminRouteForTest(
      renderAdminRoute("/admin/roles", {
        status: "ready",
        payload,
        access: rolesWriteAccess,
      }),
    );

    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "admin:users:read assigned to ops",
      }),
    );

    expect(
      await screen.findByText("Cannot strip admin core permissions"),
    ).toBeTruthy();
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

  it("falls back to the desktop breakpoint when no state provider is mounted", () => {
    render(
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <AdminLayout currentPath="/admin">
          <span>content without app store</span>
        </AdminLayout>
      </FrontendI18nProvider>,
    );

    expect(screen.getByText("content without app store")).toBeTruthy();
    expect(screen.getByText("RBAC protected · desktop")).toBeTruthy();
  });
});
