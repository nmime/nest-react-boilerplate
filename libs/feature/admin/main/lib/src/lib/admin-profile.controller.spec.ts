import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@app/feature-auth-shared";
import { ADMIN_PROFILE_READ_PERMISSION } from "@app/feature-admin-shared";
import {
  AdminProfileController,
  AdminProfilePayloadDto,
  AdminProfileViewDto,
  getAdminProfileViewDtoType,
  getAuthenticatedPrincipalDtoType,
} from "./admin-profile.controller";

describe("AdminProfileController", () => {
  it("returns principal and normalized admin profile", () => {
    const principal: AuthenticatedPrincipal = {
      subject: "admin-id",
      email: "admin@example.com",
      displayName: "Ada Admin",
      locale: "es",
      roles: ["admin", "admin"],
      permissions: [ADMIN_PROFILE_READ_PERMISSION, "profile:read"],
    };

    expect(new AdminProfileController().me(principal)).toEqual({
      data: {
        principal,
        profile: {
          id: "admin-id",
          email: "admin@example.com",
          displayName: "Ada Admin",
          locale: "es",
          roles: ["admin"],
          permissions: [ADMIN_PROFILE_READ_PERMISSION, "profile:read"],
        },
      },
    });
  });

  it("exposes DTO type thunks used by Swagger metadata", () => {
    expect(getAuthenticatedPrincipalDtoType().name).toBe(
      "AuthenticatedPrincipalDto",
    );
    expect(getAdminProfileViewDtoType()).toBe(AdminProfileViewDto);
    expect(new AdminProfilePayloadDto()).toBeInstanceOf(AdminProfilePayloadDto);
  });
});
