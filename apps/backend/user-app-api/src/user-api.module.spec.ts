import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ProfileController } from "@app/feature-user-main";
import { HealthController } from "./health.controller";
import { UserApiModule } from "./user-api.module";

describe("UserApiModule", () => {
  it("wires the app and feature controllers", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [UserApiModule],
      }).compile();

      expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
      expect(moduleRef.get(ProfileController)).toBeInstanceOf(
        ProfileController,
      );
    } finally {
      await moduleRef?.close();
    }
  });
});
