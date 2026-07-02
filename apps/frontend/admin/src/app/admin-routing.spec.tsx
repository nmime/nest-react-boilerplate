import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FrontendI18nProvider,
  FrontendStateProvider,
  adminFrontendTranslations,
} from "@app/frontend/ui";
import { createAdminAccess } from "../entities/admin-session";
import { renderAdminRoute } from "../App";
import { normalizeAdminPath } from "../shared";
import { AdminLayout } from "../widgets/admin-shell";

const renderAdminMarkup = (element: ReactElement): string =>
  renderToStaticMarkup(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        {element}
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

describe("admin route base handling", () => {
  const access = createAdminAccess({
    subject: "admin-id",
    roles: ["admin"],
    permissions: ["admin:dashboard:read", "admin:profile:read"],
  });
  const payload = {
    principal: { subject: "admin-id" },
    profile: {
      id: "admin-id",
      displayName: "Ada Admin",
      email: "admin@example.com",
    },
  };

  it("normalizes reverse-proxy /admin paths", () => {
    expect(normalizeAdminPath("/admin")).toBe("/");
    expect(normalizeAdminPath("/admin/")).toBe("/");
    expect(normalizeAdminPath("/admin/dashboard?tab=overview")).toBe(
      "/dashboard",
    );
    expect(normalizeAdminPath("/admin/users/admin-id?panel=access")).toBe(
      "/users/admin-id",
    );
    expect(normalizeAdminPath("/admin/profile")).toBe("/profile");
    expect(normalizeAdminPath("/profile")).toBe("/profile");
  });

  it("renders dashboard and profile routes when mounted at /admin", () => {
    expect(
      renderAdminMarkup(
        renderAdminRoute("/admin", { status: "ready", payload, access }),
      ),
    ).toContain("Admin dashboard");
    expect(
      renderAdminMarkup(
        renderAdminRoute("/admin/profile", {
          status: "ready",
          payload,
          access,
        }),
      ),
    ).toContain("Ada Admin");
  });

  it("keeps admin shell navigation scoped and exposes the current page", () => {
    const html = renderAdminMarkup(
      <AdminLayout currentPath="/admin/profile">
        <span>Profile content</span>
      </AdminLayout>,
    );

    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/admin/profile"');
    expect(html).not.toContain('href="/admin/tenants"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="#xr-content"');
    expect(html).toContain('class="admin-shell"');
    expect(html).toContain('class="admin-sidebar"');
    expect(html).toContain('class="admin-main-panel"');
  });

  it("renders the production admin sidebar for permissioned routes", () => {
    const fullAccess = createAdminAccess({
      subject: "admin-id",
      roles: ["admin"],
      permissions: [
        "admin:dashboard:read",
        "admin:profile:read",
        "admin:users:read",
        "admin:roles:read",
        "admin:audit:read",
      ],
    });

    const html = renderAdminMarkup(
      <AdminLayout access={fullAccess} currentPath="/admin/users">
        <span>Users content</span>
      </AdminLayout>,
    );

    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('href="/admin/roles"');
    expect(html).toContain('href="/admin/audit"');
    expect(html).toContain('data-current="true"');
  });

  it("keeps user and tenant routes explicit and fail-closed", () => {
    const fullAccess = createAdminAccess({
      subject: "admin-id",
      roles: ["admin"],
      permissions: [
        "admin:dashboard:read",
        "admin:profile:read",
        "admin:users:read",
        "admin:roles:read",
      ],
    });

    expect(
      renderAdminMarkup(
        renderAdminRoute("/users-but-not-users", {
          status: "ready",
          payload,
          access: fullAccess,
        }),
      ),
    ).toContain("Admin page not found");
    expect(
      renderAdminMarkup(
        renderAdminRoute("/admin/tenants", {
          status: "ready",
          payload,
          access,
        }),
      ),
    ).toContain("Missing admin roles permission");
    expect(
      renderAdminMarkup(
        renderAdminRoute("/admin/tenants", {
          status: "ready",
          payload,
          access: fullAccess,
        }),
      ),
    ).toContain("Tenant administration roadmap");
  });
});

describe("admin frontend CASL RBAC gating", () => {
  it("denies menu/action access for admin role without permissions", () => {
    const access = createAdminAccess({
      subject: "admin-id",
      roles: ["admin"],
      permissions: [],
    });

    expect(access.canAccessAdmin).toBe(false);
    expect(access.canReadDashboard).toBe(false);
    expect(access.canReadProfile).toBe(false);
    expect(
      renderAdminMarkup(
        renderAdminRoute("/admin", { status: "ready", payload: {}, access }),
      ),
    ).toContain("Missing admin dashboard permission");
  });

  it("denies permissions without admin role in client-side hints", () => {
    const access = createAdminAccess({
      subject: "support-id",
      roles: ["support"],
      permissions: ["admin:dashboard:read", "admin:profile:read"],
    });

    expect(access.canAccessAdmin).toBe(false);
    expect(access.canReadDashboard).toBe(false);
    expect(access.canReadProfile).toBe(false);
  });

  it("uses explicit manage/all for broad frontend admin access hints", () => {
    const access = createAdminAccess({
      subject: "admin-id",
      roles: ["admin"],
      permissions: ["admin:manage:all"],
    });

    expect(access.canAccessAdmin).toBe(true);
    expect(access.canReadDashboard).toBe(true);
    expect(access.canReadProfile).toBe(true);
  });
});
