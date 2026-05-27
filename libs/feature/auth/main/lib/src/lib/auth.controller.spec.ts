import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
  AuthenticatedResponse,
  AuthenticatedSession,
  AuthSessionView,
} from "@app/feature-auth-shared";
import type { AuthService } from "./auth.service";
import { AuthController, SESSION_COOKIE_NAME } from "./auth.controller";

type AuthControllerService = Pick<
  AuthService,
  "getUserById" | "login" | "register" | "updateUserPreferences"
>;

interface RequestFixture {
  request: AuthenticatedRequest;
  response: AuthenticatedResponse;
  reply: AuthenticatedResponse;
  rawResponse: AuthenticatedResponse;
  session: Required<
    Pick<AuthenticatedSession, "destroy" | "regenerate" | "save">
  > &
    Pick<AuthenticatedSession, "user">;
}

const sessionView: AuthSessionView = {
  user: {
    id: "user-id",
    email: "user@example.com",
    displayName: "Ada Lovelace",
    locale: "es",
    theme: "dark",
    roles: ["user", "admin"],
    permissions: ["profile:read", "admin:profile:read"],
  },
  accessToken: "access-token",
  tokenType: "Bearer",
  expiresIn: 3600,
};

function createService(
  overrides: Partial<{
    getUserById: AuthControllerService["getUserById"];
    login: AuthControllerService["login"];
    register: AuthControllerService["register"];
    updateUserPreferences: AuthControllerService["updateUserPreferences"];
  }> = {},
): AuthControllerService {
  return {
    register: vi.fn(() => Promise.resolve(sessionView)),
    login: vi.fn(() => Promise.resolve(sessionView)),
    getUserById: vi.fn(() => Promise.resolve(sessionView.user)),
    updateUserPreferences: vi.fn(() => Promise.resolve(sessionView.user)),
    ...overrides,
  };
}

function createRequest(
  principal?: AuthenticatedPrincipal,
  response: AuthenticatedResponse = { clearCookie: vi.fn() },
): RequestFixture {
  const session: RequestFixture["session"] = {
    ...(principal ? { user: principal } : {}),
    regenerate: vi.fn((callback: (error?: unknown) => void) => callback()),
    save: vi.fn((callback: (error?: unknown) => void) => callback()),
    destroy: vi.fn((callback: (error?: unknown) => void) => callback()),
  };
  const reply: AuthenticatedResponse = { clearCookie: vi.fn() };
  const rawResponse: AuthenticatedResponse = { clearCookie: vi.fn() };

  return {
    request: {
      ...(principal ? { auth: principal, user: principal } : {}),
      raw: { res: rawResponse },
      reply,
      res: response,
      session,
    },
    response,
    reply,
    rawResponse,
    session,
  };
}

function toController(service: AuthControllerService): AuthController {
  return new AuthController(service as AuthService);
}

describe("AuthController", () => {
  afterEach(() => {
    delete process.env[SESSION_COOKIE_NAME];
  });

  it("registers and exposes current session state in ok responses", async () => {
    const service = createService();
    const controller = toController(service);
    const { request, session } = createRequest();
    const principal: AuthenticatedPrincipal = {
      subject: sessionView.user.id,
      email: sessionView.user.email,
      displayName: sessionView.user.displayName,
      locale: sessionView.user.locale,
      theme: sessionView.user.theme,
      roles: sessionView.user.roles,
      permissions: sessionView.user.permissions,
    };

    await expect(
      controller.register(
        {
          email: sessionView.user.email,
          password: "password123",
          displayName: sessionView.user.displayName,
          locale: sessionView.user.locale,
        },
        request,
      ),
    ).resolves.toEqual({ data: sessionView });
    await expect(controller.me(principal)).resolves.toEqual({
      data: {
        principal,
        user: sessionView.user,
      },
    });
    expect(controller.locales()).toEqual({
      data: { supportedLocales: ["en", "es"] },
    });

    expect(service.register).toHaveBeenCalledWith({
      email: sessionView.user.email,
      password: "password123",
      displayName: sessionView.user.displayName,
      locale: sessionView.user.locale,
    });
    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
  });

  it("establishes the full session principal on login", async () => {
    const service = createService();
    const controller = toController(service);
    const { request, session } = createRequest();

    await expect(
      controller.login(
        { email: sessionView.user.email, password: "password123" },
        request,
      ),
    ).resolves.toEqual({ data: sessionView });

    const expectedPrincipal: AuthenticatedPrincipal = {
      subject: sessionView.user.id,
      email: sessionView.user.email,
      displayName: sessionView.user.displayName,
      locale: sessionView.user.locale,
      theme: sessionView.user.theme,
      roles: sessionView.user.roles,
      permissions: sessionView.user.permissions,
    };

    expect(service.login).toHaveBeenCalledWith({
      email: sessionView.user.email,
      password: "password123",
    });
    expect(session.user).toEqual(expectedPrincipal);
    expect(request.user).toEqual(expectedPrincipal);
    expect(request.auth).toEqual(expectedPrincipal);
    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
  });

  it("preserves token metadata when updating preferences", async () => {
    const updatedUser = {
      ...sessionView.user,
      displayName: "Ada Byron",
      locale: "en" as const,
      theme: "light" as const,
    };
    const service = createService({
      updateUserPreferences: vi.fn(() => Promise.resolve(updatedUser)),
    });
    const controller = toController(service);
    const principal: AuthenticatedPrincipal = {
      subject: "user-id",
      email: "user@example.com",
      displayName: "Ada Lovelace",
      locale: "es",
      theme: "dark",
      issuer: "issuer",
      audience: ["web", "mobile"],
      tokenId: "token-id",
      roles: ["user"],
      permissions: ["profile:read"],
    };
    const { request, session } = createRequest(principal);

    await expect(
      controller.updatePreferences(
        principal,
        { locale: "en", theme: "light" },
        request,
      ),
    ).resolves.toEqual({ data: updatedUser });

    expect(service.updateUserPreferences).toHaveBeenCalledWith("user-id", {
      locale: "en",
      theme: "light",
    });
    expect(session.user).toEqual({
      subject: "user-id",
      email: "user@example.com",
      displayName: "Ada Byron",
      locale: "en",
      theme: "light",
      issuer: "issuer",
      audience: ["web", "mobile"],
      tokenId: "token-id",
      roles: ["user", "admin"],
      permissions: ["profile:read", "admin:profile:read"],
    });
    expect(request.user).toEqual(session.user);
    expect(request.auth).toEqual(session.user);
    expect(session.save).toHaveBeenCalledOnce();
  });

  it("updates locale and persists the refreshed principal", async () => {
    const updatedUser = {
      ...sessionView.user,
      locale: "es" as const,
    };
    const service = createService({
      updateUserPreferences: vi.fn(() => Promise.resolve(updatedUser)),
    });
    const controller = toController(service);
    const principal: AuthenticatedPrincipal = {
      subject: "user-id",
      roles: ["user"],
      permissions: ["profile:read"],
    };
    const { request, session } = createRequest(principal);

    await expect(
      controller.updateLocale(principal, { locale: "es" }, request),
    ).resolves.toEqual({ data: updatedUser });

    expect(service.updateUserPreferences).toHaveBeenCalledWith("user-id", {
      locale: "es",
    });
    expect(session.user).toMatchObject({
      subject: "user-id",
      locale: "es",
      theme: "dark",
    });
    expect(session.save).toHaveBeenCalledOnce();
  });

  it("clears the session principal and all response adapters on logout", async () => {
    process.env[SESSION_COOKIE_NAME] = "custom.sid";
    const principal: AuthenticatedPrincipal = {
      subject: "user-id",
      email: "user@example.com",
      displayName: "Ada Lovelace",
      locale: "es",
      theme: "dark",
      roles: ["user"],
      permissions: ["profile:read"],
    };
    const response: AuthenticatedResponse = { clearCookie: vi.fn() };
    const { request, reply, rawResponse, session } = createRequest(
      principal,
      response,
    );
    const controller = toController(createService());
    const passthroughResponse: AuthenticatedResponse = {
      clearCookie: vi.fn(),
    };

    await expect(
      controller.logout(request, passthroughResponse),
    ).resolves.toEqual({
      data: { loggedOut: true },
    });

    expect(session.user).toBeUndefined();
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();
    expect(session.destroy).toHaveBeenCalledOnce();
    expect(response.clearCookie).toHaveBeenCalledWith("custom.sid", {
      path: "/",
    });
    expect(reply.clearCookie).toHaveBeenCalledWith("custom.sid", { path: "/" });
    expect(rawResponse.clearCookie).toHaveBeenCalledWith("custom.sid", {
      path: "/",
    });
    expect(passthroughResponse.clearCookie).toHaveBeenCalledWith("custom.sid", {
      path: "/",
    });
  });
});
