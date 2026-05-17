import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
import { AdminAppApiModule } from "./admin-app-api.module";

describe("backend-admin-app-api health e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminAppApiModule],
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

    await supertest(httpServer)
      .get("/health")
      .expect(200)
      .expect({ data: { app: "backend-admin-app-api", status: "ok" } });
  });

  it("GET /live and /ready return ok", async () => {
    const httpServer = app.getHttpServer() as unknown as Parameters<
      typeof supertest
    >[0];

    await supertest(httpServer)
      .get("/live")
      .expect(200)
      .expect({ data: { app: "backend-admin-app-api", status: "ok" } });
    await supertest(httpServer)
      .get("/ready")
      .expect(200)
      .expect({ data: { app: "backend-admin-app-api", status: "ok" } });
  });
});
