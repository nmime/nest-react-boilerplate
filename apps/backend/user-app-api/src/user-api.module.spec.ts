import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { BaseHealthController, HealthService } from "@app/common/health";
import { ProfileController } from "@app/feature-user-main";
import { UserApiModule } from "./user-api.module";

// The app imports the shared health controller from @app/common/health instead
// of declaring an app-local duplicate controller.
describe("UserApiModule", () => {
  it("wires the app, feature controllers, and shared health service", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [UserApiModule],
      }).compile();

      expect(moduleRef.get(BaseHealthController)).toBeInstanceOf(
        BaseHealthController,
      );
      expect(moduleRef.get(HealthService).appName).toBe("user-app-api");
      expect(moduleRef.get(ProfileController)).toBeInstanceOf(
        ProfileController,
      );
    } finally {
      await moduleRef?.close();
    }
  });
});
