import { describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller";

function createRequest() {
  return {
    session: {
      regenerate: vi.fn((callback: (error?: unknown) => void) => callback()),
      save: vi.fn((callback: (error?: unknown) => void) => callback()),
      destroy: vi.fn((callback: (error?: unknown) => void) => callback()),
    },
    res: { clearCookie: vi.fn() },
  };
}

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
      controller.register(
        { email: "e", password: "password123" },
        createRequest() as never,
      ),
    ).resolves.toEqual({ data: session });
    await expect(
      controller.login(
        { email: "e", password: "password123" },
        createRequest() as never,
      ),
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
        createRequest() as never,
      ),
    ).resolves.toEqual({ data: session.user });
    await expect(
      controller.updatePreferences(
        { subject: "id", roles: [], permissions: [] },
        { locale: "en", theme: "light" },
        createRequest() as never,
      ),
    ).resolves.toEqual({ data: session.user });
    await expect(
      controller.logout(createRequest() as never, undefined as never),
    ).resolves.toEqual({ data: { loggedOut: true } });
  });
});
