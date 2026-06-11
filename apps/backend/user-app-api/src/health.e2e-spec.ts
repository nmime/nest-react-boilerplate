import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createValidationPipe } from "@app/common/validation";
import { UserApiModule } from "./user-api.module";

describe("user-app-api health e2e", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UserApiModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
        expect.objectContaining({ name: "session-config" }),
        expect.objectContaining({
          name: "postgres",
          status: "ok",
          required: false,
        }),
      ]),
    });
  });

  it("GET /live and /ready return ok without a MikroORM provider", async () => {
    const liveResponse = await app.inject({ method: "GET", url: "/live" });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.json()).toMatchObject({
      data: {
        app: "user-app-api",
        status: expect.stringMatching(/^(ok|degraded)$/),
      },
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      data: {
        app: "user-app-api",
        status: expect.stringMatching(/^(ok|degraded)$/),
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            name: "postgres",
            status: "ok",
            required: false,
            details: expect.objectContaining({ skipped: true }),
          }),
          expect.objectContaining({
            name: "redis",
            status: "ok",
            required: false,
          }),
          expect.objectContaining({
            name: "nats",
            status: "ok",
            required: false,
          }),
        ]),
      },
    });
  });
});
