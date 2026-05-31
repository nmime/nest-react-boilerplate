import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
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
      data: { app: "user-app-api", status: "ok" },
    });
  });

  it("GET /live and /ready return ok", async () => {
    const liveResponse = await app.inject({ method: "GET", url: "/live" });
    expect(liveResponse.statusCode).toBe(200);
    expect(liveResponse.json()).toEqual({
      data: { app: "user-app-api", status: "ok" },
    });

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toEqual({
      data: { app: "user-app-api", status: "ok" },
    });
  });
});
