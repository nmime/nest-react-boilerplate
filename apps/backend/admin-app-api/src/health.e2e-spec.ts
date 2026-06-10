import { MikroORM } from "@mikro-orm/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
import { AdminAppApiModule } from "./admin-app-api.module";

describe("backend-admin-app-api health e2e", () => {
  let app: NestFastifyApplication;
  const ormMock = {
    close: vi.fn(() => Promise.resolve()),
    em: {
      fork: vi.fn(() => ormMock.em),
      getConnection: () => ({ execute: vi.fn(() => Promise.resolve()) }),
      getMigrator: () => ({ getPendingMigrations: vi.fn(() => Promise.resolve([])) }),
      getRepository: () => ({}),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminAppApiModule],
    })
      .overrideProvider(MikroORM)
      .useValue(ormMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalPipes(createProblemValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
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
        expect.objectContaining({ name: "postgres", status: "ok" }),
        expect.objectContaining({ name: "postgres-migrations", status: "ok" }),
        expect.objectContaining({ name: "redis", status: "ok", required: false }),
        expect.objectContaining({ name: "nats", status: "ok", required: false }),
      ]),
    });
  });

  it("GET /live and /ready return shared envelopes with dependencies", async () => {
    const liveResponse = await app.inject({ method: "GET", url: "/live" });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.json()).toMatchObject({
      data: {
        app: "backend-admin-app-api",
        status: expect.stringMatching(/^(ok|degraded)$/),
        dependencies: expect.arrayContaining([
          expect.objectContaining({ name: "runtime", status: "ok" }),
        ]),
      },
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toMatchObject({
      data: {
        app: "backend-admin-app-api",
        dependencies: expect.arrayContaining([
          expect.objectContaining({ name: "postgres", status: "ok" }),
          expect.objectContaining({ name: "postgres-migrations", status: "ok" }),
          expect.objectContaining({ name: "redis", status: "ok", required: false }),
          expect.objectContaining({ name: "nats", status: "ok", required: false }),
        ]),
        status: expect.stringMatching(/^(ok|degraded)$/),
      },
    });
  });

  it("GET /ready returns 503 with safe details for mandatory Postgres failure", async () => {
    const failingOrmMock = {
      ...ormMock,
      em: {
        ...ormMock.em,
        getConnection: () => ({
          execute: vi.fn(() =>
            Promise.reject(
              new Error(
                "password=super-secret postgres://user:super-secret@db:5432/app",
              ),
            ),
          ),
        }),
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AdminAppApiModule],
    })
      .overrideProvider(MikroORM)
      .useValue(failingOrmMock)
      .compile();
    const failingApp = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    try {
      await failingApp.init();
      const response = await failingApp.inject({ method: "GET", url: "/ready" });
      const body = response.json();

      expect(response.statusCode).toBe(503);
      expect(JSON.stringify(body)).not.toContain("super-secret");
      const errorPayload = body.response?.data ?? body.data ?? body.response ?? body;
      expect(errorPayload.app).toBe("backend-admin-app-api");
      expect(errorPayload.dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "postgres",
            status: "error",
            detail: expect.not.stringContaining("super-secret"),
            details: expect.objectContaining({
              message: expect.not.stringContaining("super-secret"),
            }),
          }),
        ]),
      );
    } finally {
      await failingApp.close();
    }
  });
});
