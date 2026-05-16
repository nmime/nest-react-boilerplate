import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@app/features-auth-oauth";
import { ADMIN_LEGACY_READ_PERMISSION } from "@app/features-admin-shared";
import { AdminProfileController } from "./admin-profile.controller";

describe("AdminProfileController", () => {
  it("returns principal and normalized admin profile", () => {
    const principal: AuthenticatedPrincipal = {
      subject: "admin-id",
      email: "admin@example.com",
      displayName: "Ada Admin",
      roles: ["admin", "admin"],
      permissions: [ADMIN_LEGACY_READ_PERMISSION, "profile:read"],
    };

    expect(new AdminProfileController().me(principal)).toEqual({
      data: {
        principal,
        profile: {
          id: "admin-id",
          email: "admin@example.com",
          displayName: "Ada Admin",
          roles: ["admin"],
          permissions: [ADMIN_LEGACY_READ_PERMISSION, "profile:read"],
        },
      },
    });
  });
});
