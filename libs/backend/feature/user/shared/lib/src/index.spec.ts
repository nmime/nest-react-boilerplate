import { describe, expect, it } from "vitest";
import {
  createUserProfile,
  GetCurrentUserProfileUseCase,
  toUserProfilePayload,
  toUserProfileView,
  USER_PROFILE_READ_PERMISSION,
} from "./index";

describe("user shared", () => {
  it("keeps domain profile creation framework-free and normalized", () => {
    expect(
      createUserProfile({
        subject: "user-id",
        email: "user@example.com",
        displayName: "User",
        locale: "ru",
        roles: [" user ", "user", ""],
        permissions: [
          USER_PROFILE_READ_PERMISSION,
          USER_PROFILE_READ_PERMISSION,
        ],
      }),
    ).toEqual({
      id: "user-id",
      email: "user@example.com",
      displayName: "User",
      locale: "ru",
      roles: ["user"],
      permissions: [USER_PROFILE_READ_PERMISSION],
    });
  });

  it("uses the application use case to expose the current profile", () => {
    const principal = {
      subject: "user-id",
      email: "user@example.com",
      displayName: "User",
      locale: "ru",
      roles: ["user"],
      permissions: [USER_PROFILE_READ_PERMISSION],
    };

    expect(new GetCurrentUserProfileUseCase().execute(principal)).toEqual({
      principal,
      profile: {
        id: "user-id",
        email: "user@example.com",
        displayName: "User",
        locale: "ru",
        roles: ["user"],
        permissions: [USER_PROFILE_READ_PERMISSION],
      },
    });
  });

  it("maps principals to user profile views", () => {
    expect(
      toUserProfileView({
        subject: "user-id",
        email: "user@example.com",
        displayName: "User",
        locale: "ru",
        roles: ["user", "user"],
        permissions: [USER_PROFILE_READ_PERMISSION],
      }),
    ).toEqual({
      id: "user-id",
      email: "user@example.com",
      displayName: "User",
      locale: "ru",
      roles: ["user"],
      permissions: [USER_PROFILE_READ_PERMISSION],
    });
  });

  it("presents current profile payloads for interfaces", () => {
    const principal = {
      subject: "user-id",
      email: "user@example.com",
      roles: ["user"],
      permissions: [USER_PROFILE_READ_PERMISSION],
    };

    expect(toUserProfilePayload(principal)).toEqual({
      principal,
      profile: {
        id: "user-id",
        email: "user@example.com",
        roles: ["user"],
        permissions: [USER_PROFILE_READ_PERMISSION],
      },
    });
  });
});
