import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@app/backend/feature/auth/shared";
import { ProfileController } from "./profile.controller";

describe("User ProfileController", () => {
  it("returns principal and profile", () => {
    const principal: AuthenticatedPrincipal = {
      subject: "user-id",
      email: "user@example.com",
      displayName: "User Name",
      locale: "ru",
      roles: ["user"],
      permissions: ["profile:read"],
    };

    expect(new ProfileController().me(principal)).toEqual({
      data: {
        principal,
        profile: {
          id: "user-id",
          email: "user@example.com",
          displayName: "User Name",
          locale: "ru",
          roles: ["user"],
          permissions: ["profile:read"],
        },
      },
    });
  });
});
