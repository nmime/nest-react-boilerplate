import { describe, expect, it } from "vitest";
import { createUserProfile } from "./user-profile";

describe("createUserProfile", () => {
  it("splits space/comma-delimited role and permission strings and normalizes them", () => {
    expect(
      createUserProfile({
        subject: "user-id",
        roles: " admin, user  user " as unknown as readonly string[],
        permissions:
          "profile:read profile:read" as unknown as readonly string[],
      }),
    ).toEqual({
      id: "user-id",
      email: undefined,
      displayName: undefined,
      locale: undefined,
      roles: ["admin", "user"],
      permissions: ["profile:read"],
    });
  });

  it("drops empty segments produced by delimiter-only strings", () => {
    expect(
      createUserProfile({
        subject: "user-id",
        roles: "  ," as unknown as readonly string[],
        permissions: [],
      }),
    ).toEqual(
      expect.objectContaining({
        roles: [],
        permissions: [],
      }),
    );
  });

  it("falls back to an empty list when roles/permissions are neither an array nor a string", () => {
    expect(
      createUserProfile({
        subject: "user-id",
        roles: undefined as unknown as readonly string[],
        permissions: 42 as unknown as readonly string[],
      }),
    ).toEqual(
      expect.objectContaining({
        roles: [],
        permissions: [],
      }),
    );
  });
});
