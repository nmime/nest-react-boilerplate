import { describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  it("wraps auth service calls in ok responses", async () => {
    const session = {
      user: {
        id: "id",
        email: "e",
        roles: [],
        permissions: [],
        locale: "es",
        theme: "dark",
      },
      accessToken: "t",
      tokenType: "Bearer" as const,
      expiresIn: 1,
    };
    const service = {
      register: () => Promise.resolve(session),
      login: () => Promise.resolve(session),
      getUserById: () => Promise.resolve(session.user),
      updateUserPreferences: () => Promise.resolve(session.user),
    };
    const controller = new AuthController(service as never);

    await expect(
      controller.register({ email: "e", password: "password123" }),
    ).resolves.toEqual({ data: session });
    await expect(
      controller.login({ email: "e", password: "password123" }),
    ).resolves.toEqual({ data: session });
    await expect(
      controller.me({ subject: "id", roles: [], permissions: [] }),
    ).resolves.toEqual({
      data: {
        principal: { subject: "id", roles: [], permissions: [] },
        user: session.user,
      },
    });
    await expect(
      controller.updateLocale(
        { subject: "id", roles: [], permissions: [] },
        { locale: "es" },
      ),
    ).resolves.toEqual({ data: session.user });
    await expect(
      controller.updatePreferences(
        { subject: "id", roles: [], permissions: [] },
        { locale: "en", theme: "light" },
      ),
    ).resolves.toEqual({ data: session.user });
    expect(controller.logout()).toEqual({ data: { loggedOut: true } });
  });
});
