import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AuthController } from "@app/feature-auth-main";
import { HealthController } from "./health.controller";
import { AuthApiModule } from "./auth-api.module";

describe("AuthApiModule", () => {
  it("wires the app and feature controllers", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [AuthApiModule],
      }).compile();

      expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
      expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
    } finally {
      await moduleRef?.close();
    }
  });
});
