import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@app/feature-auth-oauth";
import { ProfileController } from "./profile.controller";

describe("user-app-api ProfileController", () => {
  it("returns the current principal in an ok response", () => {
    const principal: AuthenticatedPrincipal = {
      subject: "user-id",
      email: "user@example.com",
      roles: ["user"],
      permissions: ["profile:read"],
    };

    expect(new ProfileController().me(principal)).toEqual({
      data: { principal },
    });
  });
});
