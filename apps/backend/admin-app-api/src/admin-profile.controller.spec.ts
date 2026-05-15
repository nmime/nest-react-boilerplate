import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@app/features-auth-oauth";
import { AdminProfileController } from "./admin-profile.controller";

describe("backend-admin-app-api AdminProfileController", () => {
  it("returns the current principal in an ok response", () => {
    const principal: AuthenticatedPrincipal = {
      subject: "admin-id",
      email: "admin@example.com",
      roles: ["admin"],
      permissions: ["admin:read", "profile:read"],
    };

    expect(new AdminProfileController().me(principal)).toEqual({
      data: { principal },
    });
  });
});
