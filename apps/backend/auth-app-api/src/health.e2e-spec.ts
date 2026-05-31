import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
import { AuthApiModule } from "./auth-api.module";

type UserThemePreference = "system" | "light" | "dark";

interface AuthSessionResponse {
  data: {
    accessToken: string;
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
    app.useGlobalPipes(createProblemValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });
  });

  it("registers, logs in, returns me, and logs out with a bearer token", async () => {
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
    expect(registerBody.data.user.email).toBe("e2e@example.com");
    expect(registerBody.data.user.theme).toBe("system");

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
      },
    });
    expect(me.statusCode).toBe(200);
    const meBody = me.json<{
      data?: {
        principal?: { email?: string; theme?: UserThemePreference };
        user?: { theme?: UserThemePreference };
      };
    }>();
    expect(meBody.data?.principal?.email).toBe("e2e@example.com");
    expect(meBody.data?.user?.theme).toBe("system");

    const preferences = await app.inject({
      method: "PATCH",
      url: "/auth/me/preferences",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "ru", theme: "dark" }),
    });
    expect(preferences.statusCode).toBe(200);
    const preferencesBody = preferences.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(preferencesBody.data?.locale).toBe("ru");
    expect(preferencesBody.data?.theme).toBe("dark");

    const locale = await app.inject({
      method: "PATCH",
      url: "/auth/me/locale",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
        "content-type": "application/json",
      },
      payload: JSON.stringify({ locale: "en" }),
    });
    expect(locale.statusCode).toBe(200);
    const localeBody = locale.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(localeBody.data?.locale).toBe("en");
    expect(localeBody.data?.theme).toBe("dark");

    const invalidTheme = await app.inject({
      method: "PATCH",
      url: "/auth/me/preferences",
      headers: {
        authorization: bearerAuthorization(registerBody.data.accessToken),
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

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        authorization: bearerAuthorization(loginBody.data.accessToken),
      },
    });
    expect(logout.statusCode).toBe(201);
    expect(logout.json()).toEqual({ data: { loggedOut: true } });
  });

  it("GET /live and /ready return ok", async () => {
    const liveResponse = await app.inject({ method: "GET", url: "/live" });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.json()).toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toEqual({
      data: { app: "auth-app-api", status: "ok" },
    });
  });
});
