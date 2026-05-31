import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AdminProfileController } from "@app/feature-admin-main";
import { HealthController } from "./health.controller";
import { AdminAppApiModule } from "./admin-app-api.module";

describe("AdminAppApiModule", () => {
  it("wires the app and feature controllers", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [AdminAppApiModule],
      }).compile();

      expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
      expect(moduleRef.get(AdminProfileController)).toBeInstanceOf(
        AdminProfileController,
      );
    } finally {
      await moduleRef?.close();
    }
  });
});
