import { describe, expect, it } from "vitest";
import { toUserProfileView, USER_PROFILE_READ_PERMISSION } from "./index";

describe("user shared", () => {
  it("maps principals to user profile views", () => {
    expect(
      toUserProfileView({
        subject: "user-id",
        email: "user@example.com",
        displayName: "User",
        locale: "es",
        roles: ["user", "user"],
        permissions: [USER_PROFILE_READ_PERMISSION],
      }),
    ).toEqual({
      id: "user-id",
      email: "user@example.com",
      displayName: "User",
      locale: "es",
      roles: ["user"],
      permissions: [USER_PROFILE_READ_PERMISSION],
    });
  });
});
