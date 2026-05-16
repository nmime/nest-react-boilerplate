import { describe, expect, it } from "vitest";
import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  it("wraps auth service calls in ok responses", async () => {
    const session = {
      user: { id: "id", email: "e", roles: [], permissions: [] },
      accessToken: "t",
      tokenType: "Bearer" as const,
      expiresIn: 1,
    };
    const service = {
      register: () => Promise.resolve(session),
      login: () => Promise.resolve(session),
    };
    const controller = new AuthController(service as never);

    await expect(
      controller.register({ email: "e", password: "password123" }),
    ).resolves.toEqual({ data: session });
    await expect(
      controller.login({ email: "e", password: "password123" }),
    ).resolves.toEqual({ data: session });
    expect(
      controller.me({ subject: "id", roles: [], permissions: [] }),
    ).toEqual({
      data: { principal: { subject: "id", roles: [], permissions: [] } },
    });
    expect(controller.logout()).toEqual({ data: { loggedOut: true } });
  });
});
