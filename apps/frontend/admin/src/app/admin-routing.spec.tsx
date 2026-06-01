import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAdminAccess } from "./auth-rbac";
import { normalizeAdminPath, renderAdminRoute } from "./pages";

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
    expect(normalizeAdminPath("/admin/profile")).toBe("/profile");
    expect(normalizeAdminPath("/profile")).toBe("/profile");
  });

  it("renders dashboard and profile routes when mounted at /admin", () => {
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/admin", { status: "ready", payload, access }),
      ),
    ).toContain("Admin dashboard");
    expect(
      renderToStaticMarkup(
        renderAdminRoute("/admin/profile", {
          status: "ready",
          payload,
          access,
        }),
      ),
    ).toContain("Ada Admin");
  });
});
