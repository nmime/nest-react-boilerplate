import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
import { AuthApiModule } from "./auth-api.module";

interface AuthSessionResponse {
  data: {
    accessToken: string;
    user: { email: string };
  };
}

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
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof supertest
    >[0];

    const response = await supertest(httpServer)
      .get("/health")
      .expect(200)
      .expect({ data: { app: "auth-app-api", status: "ok" } });

    expect(response.status).toBe(200);
  });

  it("registers, logs in, returns me, and logs out with a bearer token", async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
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

    await supertest(httpServer)
      .get("/auth/me")
      .set("Authorization", `Bearer ${registerBody.data.accessToken}`)
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          data?: { principal?: { email?: string } };
        };
        if (body.data?.principal?.email !== "e2e@example.com") {
          throw new Error("registered token principal email mismatch");
        }
      });

    const login = await supertest(httpServer)
      .post("/auth/login")
      .send({ email: "e2e@example.com", password })
      .expect(201);

    const loginBody = login.body as AuthSessionResponse;
    expect(loginBody.data.user.email).toBe("e2e@example.com");

    await supertest(httpServer)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${loginBody.data.accessToken}`)
      .expect(201)
      .expect({ data: { loggedOut: true } });
  });

  it("GET /live and /ready return ok", async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
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
