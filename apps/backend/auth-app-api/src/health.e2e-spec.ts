import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
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
  let app: INestApplication;

  beforeAll(async () => {
    process.env.AUTH_PERSISTENCE = "memory";
    process.env.AUTH_JWT_SECRET = "e2e-secret";
    const moduleRef = await Test.createTestingModule({
      imports: [AuthApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createProblemValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const httpServer = app.getHttpAdapter().getInstance() as Parameters<
      typeof supertest
    >[0];

    const response = await supertest(httpServer)
      .get("/health")
      .expect(200)
      .expect({ data: { app: "auth-app-api", status: "ok" } });

    expect(response.status).toBe(200);
  });

  it("registers, logs in, returns me, and logs out with a bearer token", async () => {
    const httpServer = app.getHttpAdapter().getInstance() as Parameters<
      typeof supertest
    >[0];

    const password = `e2e-${Date.now().toString(36)}-secret`;
    const register = await supertest(httpServer)
      .post("/auth/register")
      .send({
        email: "e2e@example.com",
        password,
        displayName: "E2E User",
      })
      .expect(201);
    const registerBody = register.body as AuthSessionResponse;
    expect(registerBody.data.user.email).toBe("e2e@example.com");
    expect(registerBody.data.user.theme).toBe("system");

    await supertest(httpServer)
      .get("/auth/me")
      .set("Authorization", bearerAuthorization(registerBody.data.accessToken))
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          data?: {
            principal?: { email?: string; theme?: UserThemePreference };
            user?: { theme?: UserThemePreference };
          };
        };
        if (body.data?.principal?.email !== "e2e@example.com") {
          throw new Error("registered token principal email mismatch");
        }
        if (body.data?.user?.theme !== "system") {
          throw new Error("registered user theme mismatch");
        }
      });

    await supertest(httpServer)
      .patch("/auth/me/preferences")
      .set("Authorization", bearerAuthorization(registerBody.data.accessToken))
      .send({ locale: "ru", theme: "dark" })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          data?: { locale?: string; theme?: UserThemePreference };
        };
        if (body.data?.locale !== "ru" || body.data.theme !== "dark") {
          throw new Error("preferences endpoint did not persist locale/theme");
        }
      });

    await supertest(httpServer)
      .patch("/auth/me/locale")
      .set("Authorization", bearerAuthorization(registerBody.data.accessToken))
      .send({ locale: "en" })
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          data?: { locale?: string; theme?: UserThemePreference };
        };
        if (body.data?.locale !== "en" || body.data.theme !== "dark") {
          throw new Error("locale compatibility endpoint changed theme");
        }
      });

    await supertest(httpServer)
      .patch("/auth/me/preferences")
      .set("Authorization", bearerAuthorization(registerBody.data.accessToken))
      .send({ theme: "sepia" })
      .expect(400);

    const login = await supertest(httpServer)
      .post("/auth/login")
      .send({ email: "e2e@example.com", password })
      .expect(201);

    const loginBody = login.body as AuthSessionResponse;
    expect(loginBody.data.user.email).toBe("e2e@example.com");

    await supertest(httpServer)
      .post("/auth/logout")
      .set("Authorization", bearerAuthorization(loginBody.data.accessToken))
      .expect(201)
      .expect({ data: { loggedOut: true } });
  });

  it("GET /live and /ready return ok", async () => {
    const httpServer = app.getHttpAdapter().getInstance() as Parameters<
      typeof supertest
    >[0];

    await supertest(httpServer)
      .get("/live")
      .expect(200)
      .expect({ data: { app: "auth-app-api", status: "ok" } });
    await supertest(httpServer)
      .get("/ready")
      .expect(200)
      .expect({ data: { app: "auth-app-api", status: "ok" } });
  });
});
