import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { BaseHealthController, HealthService } from "@app/common/health";
import { AdminProfileController } from "@app/feature-admin-main";
import { AdminAppApiModule } from "./admin-app-api.module";

// The app imports the shared health controller from @app/common/health instead
// of declaring an app-local duplicate controller.
describe("AdminAppApiModule", () => {
  it("wires the app, feature controllers, and shared health service", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [AdminAppApiModule],
      }).compile();

      expect(moduleRef.get(BaseHealthController)).toBeInstanceOf(
        BaseHealthController,
      );
      expect(moduleRef.get(HealthService).appName).toBe("backend-admin-app-api");
      expect(moduleRef.get(AdminProfileController)).toBeInstanceOf(
        AdminProfileController,
      );
    } finally {
      await moduleRef?.close();
    }
  });
});
