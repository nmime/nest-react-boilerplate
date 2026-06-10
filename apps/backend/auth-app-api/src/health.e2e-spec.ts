import { randomUUID } from "node:crypto";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
import type {
  AuthenticatedPrincipal,
  AuthenticatedSession,
} from "@app/feature-auth-shared";
import { AuthApiModule } from "./auth-api.module";

type UserThemePreference = "system" | "light" | "dark";

interface AuthSessionResponse {
  data: {
    accessToken: string;
    refreshToken?: string;
    user: {
      email: string;
      locale?: string;
      theme: UserThemePreference;
    };
  };
}

const authorizationScheme = "Bearer";

const bearerAuthorization = (token: string): string =>
  [authorizationScheme, token].join(" ");

function readSessionId(
  cookieHeader: string | string[] | undefined,
): string | undefined {
  const header = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;

  return header
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith("nrb.sid="))
    ?.slice("nrb.sid=".length);
}

function installInMemorySession(app: NestFastifyApplication): void {
  const sessions = new Map<string, AuthenticatedPrincipal>();
  const fastify = app.getHttpAdapter().getInstance() as {
    addHook: (
      hook: "preHandler",
      handler: (
        request: { headers: { cookie?: string | string[] } },
        reply: { header: (name: string, value: string) => void },
        done: () => void,
      ) => void,
    ) => void;
  };

  fastify.addHook("preHandler", (request, reply, done) => {
    let sessionId = readSessionId(request.headers.cookie);
    const session = {
      ...(sessionId && sessions.has(sessionId)
        ? { user: sessions.get(sessionId) }
        : {}),
      destroy: (callback?: (error?: unknown) => void) => {
        if (sessionId) {
          sessions.delete(sessionId);
        }
        delete session.user;
        reply.header("set-cookie", "nrb.sid=; Path=/; Max-Age=0; HttpOnly");
        callback?.();
      },
      regenerate: (callback?: (error?: unknown) => void) => {
        sessionId = randomUUID();
        callback?.();
      },
      save: (callback?: (error?: unknown) => void) => {
        if (sessionId && session.user) {
          sessions.set(sessionId, session.user);
          reply.header("set-cookie", `nrb.sid=${sessionId}; Path=/; HttpOnly`);
        }
        callback?.();
      },
    } as AuthenticatedSession;

    (request as { session?: AuthenticatedSession }).session = session;
    done();
  });
}

function sessionCookieHeader(response: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const setCookie = response.headers["set-cookie"];
  let cookies: string[] = [];

  if (Array.isArray(setCookie)) {
    cookies = setCookie;
  } else if (setCookie) {
    cookies = [setCookie];
  }

  return cookies
    .map((cookie) => cookie.split(";")[0])
    .filter((cookie) => cookie.length > 0)
    .join("; ");
}

describe("auth-app-api e2e", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.AUTH_PERSISTENCE = "memory";
    process.env.AUTH_JWT_SECRET = "e2e-secret";
    const moduleRef = await Test.createTestingModule({
      imports: [AuthApiModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    installInMemorySession(app);
    app.useGlobalPipes(createProblemValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_PERSISTENCE;
    delete process.env.AUTH_JWT_SECRET;
  });

  it("GET /health returns shared liveness-compatible health details", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      checks: expect.arrayContaining([
        expect.objectContaining({ name: "runtime", status: "ok" }),
        expect.objectContaining({ name: "config" }),
        expect.objectContaining({ name: "i18n" }),
        expect.objectContaining({
          name: "auth-persistence",
          status: "ok",
          details: expect.objectContaining({ mode: "memory" }),
        }),
        expect.objectContaining({ name: "postgres", status: "ok", required: false }),
      ]),
    });
  });

  it("supports session-only and bearer-only callers for auth self endpoints", async () => {
    const password = `e2e-${Date.now().toString(36)}-secret`;
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        email: "e2e@example.com",
        password,
        displayName: "E2E User",
      }),
    });
    expect(register.statusCode).toBe(201);
    const registerBody = register.json<AuthSessionResponse>();
    let registerCookieHeader = sessionCookieHeader(register);
    expect(registerCookieHeader).toContain("nrb.sid=");
    expect(registerBody.data.user.email).toBe("e2e@example.com");
    expect(registerBody.data.user.theme).toBe("system");
    expect(registerBody.data.refreshToken).toEqual(expect.any(String));

    const sessionOnlyMe = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: registerCookieHeader },
    });
    expect(sessionOnlyMe.statusCode).toBe(200);
    const sessionOnlyMeBody = sessionOnlyMe.json<{
      data?: {
        principal?: { email?: string; theme?: UserThemePreference };
        user?: { theme?: UserThemePreference };
      };
    }>();
    expect(sessionOnlyMeBody.data?.principal?.email).toBe("e2e@example.com");
    expect(sessionOnlyMeBody.data?.user?.theme).toBe("system");

    const bearerOnlyMe = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
      },
    });
    expect(bearerOnlyMe.statusCode).toBe(200);
    const bearerOnlyMeBody = bearerOnlyMe.json<{
      data?: { principal?: { email?: string; theme?: UserThemePreference } };
    }>();
    expect(bearerOnlyMeBody.data?.principal?.email).toBe("e2e@example.com");

    const crossTenant = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
        "x-tenant-id": "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(crossTenant.statusCode).toBe(401);

    const refreshed = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ refreshToken: registerBody.data.refreshToken }),
    });
    expect(refreshed.statusCode).toBe(201);
    const refreshedBody = refreshed.json<AuthSessionResponse>();
    expect(refreshedBody.data.accessToken).toEqual(expect.any(String));
    expect(refreshedBody.data.refreshToken).toEqual(expect.any(String));
    expect(refreshedBody.data.refreshToken).not.toBe(
      registerBody.data.refreshToken,
    );

    const replayedRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ refreshToken: registerBody.data.refreshToken }),
    });
    expect(replayedRefresh.statusCode).toBe(401);

    const bearerOnlyPreferences = await app.inject({
      method: "PATCH",
      url: "/auth/me/preferences",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "ru", theme: "dark" }),
    });
    expect(bearerOnlyPreferences.statusCode).toBe(200);
    const bearerOnlyPreferencesBody = bearerOnlyPreferences.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(bearerOnlyPreferencesBody.data?.locale).toBe("ru");
    expect(bearerOnlyPreferencesBody.data?.theme).toBe("dark");

    const sessionOnlyPreferences = await app.inject({
      method: "PATCH",
      url: "/auth/me/preferences",
      headers: {
        cookie: registerCookieHeader,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "en", theme: "light" }),
    });
    expect(sessionOnlyPreferences.statusCode).toBe(200);
    const preferencesCookieHeader = sessionCookieHeader(sessionOnlyPreferences);
    if (preferencesCookieHeader) {
      registerCookieHeader = preferencesCookieHeader;
    }
    const sessionOnlyPreferencesBody = sessionOnlyPreferences.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(sessionOnlyPreferencesBody.data?.locale).toBe("en");
    expect(sessionOnlyPreferencesBody.data?.theme).toBe("light");

    const bearerOnlyLocale = await app.inject({
      method: "PATCH",
      url: "/auth/me/locale",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "ru" }),
    });
    expect(bearerOnlyLocale.statusCode).toBe(200);
    const bearerOnlyLocaleBody = bearerOnlyLocale.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(bearerOnlyLocaleBody.data?.locale).toBe("ru");
    expect(bearerOnlyLocaleBody.data?.theme).toBe("light");

    const sessionOnlyLocale = await app.inject({
      method: "PATCH",
      url: "/auth/me/locale",
      headers: {
        cookie: registerCookieHeader,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "en" }),
    });
    expect(sessionOnlyLocale.statusCode).toBe(200);
    const localeCookieHeader = sessionCookieHeader(sessionOnlyLocale);
    if (localeCookieHeader) {
      registerCookieHeader = localeCookieHeader;
    }
    const sessionOnlyLocaleBody = sessionOnlyLocale.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(sessionOnlyLocaleBody.data?.locale).toBe("en");
    expect(sessionOnlyLocaleBody.data?.theme).toBe("light");

    const invalidRegisterLocale = await app.inject({
      method: "POST",
      url: "/auth/register",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        email: "invalid-locale@example.com",
        password,
        locale: "fr",
      }),
    });
    expect(invalidRegisterLocale.statusCode).toBe(400);

    const invalidLocale = await app.inject({
      method: "PATCH",
      url: "/auth/me/locale",
      headers: {
        cookie: registerCookieHeader,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "fr" }),
    });
    expect(invalidLocale.statusCode).toBe(400);

    const invalidTheme = await app.inject({
      method: "PATCH",
      url: "/auth/me/preferences",
      headers: {
        cookie: registerCookieHeader,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ theme: "sepia" }),
    });
    expect(invalidTheme.statusCode).toBe(400);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ email: "e2e@example.com", password }),
    });
    expect(login.statusCode).toBe(201);
    const loginBody = login.json<AuthSessionResponse>();
    expect(loginBody.data.user.email).toBe("e2e@example.com");

    const bearerOnlyLogout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        authorization: bearerAuthorization(loginBody.data.accessToken),
        "content-type": "application/json",
      },
      payload: JSON.stringify({ refreshToken: loginBody.data.refreshToken }),
    });
    expect(bearerOnlyLogout.statusCode).toBe(201);
    expect(bearerOnlyLogout.json()).toEqual({ data: { loggedOut: true } });

    const sessionOnlyLogout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: registerCookieHeader },
    });
    expect(sessionOnlyLogout.statusCode).toBe(201);
    expect(sessionOnlyLogout.json()).toEqual({ data: { loggedOut: true } });

    const sessionAfterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: registerCookieHeader },
    });
    expect(sessionAfterLogout.statusCode).toBe(401);
  });

  it("GET /live and /ready return ok with memory persistence and skipped Postgres", async () => {
    const liveResponse = await app.inject({ method: "GET", url: "/live" });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.json()).toMatchObject({
      data: { app: "auth-app-api", status: expect.stringMatching(/^(ok|degraded)$/) },
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      data: {
        app: "auth-app-api",
        status: expect.stringMatching(/^(ok|degraded)$/),
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            name: "auth-persistence",
            status: "ok",
            details: expect.objectContaining({ mode: "memory" }),
          }),
          expect.objectContaining({
            name: "postgres",
            status: "ok",
            required: false,
            details: expect.objectContaining({ skipped: true }),
          }),
          expect.objectContaining({ name: "redis", status: "ok", required: false }),
          expect.objectContaining({ name: "nats", status: "ok", required: false }),
        ]),
      },
    });
  });
});
