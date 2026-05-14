import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createProblemValidationPipe } from "@app/common/validation";
import { AuthApiModule } from "./auth-api.module";

describe("auth-app-api health e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
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

    await supertest(httpServer)
      .get("/health")
      .expect(200)
      .expect({ data: { app: "auth-app-api", status: "ok" } });
  });
});
