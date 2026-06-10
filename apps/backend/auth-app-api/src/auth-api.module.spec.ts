import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { BaseHealthController, HealthService } from "@app/common/health";
import { AuthController } from "@app/feature-auth-main";
import { AuthApiModule } from "./auth-api.module";

// The app imports the shared health controller from @app/common/health instead
// of declaring an app-local duplicate controller.
describe("AuthApiModule", () => {
  it("wires the app, feature controllers, and shared health service", async () => {
    let moduleRef: TestingModule | undefined;
    process.env.AUTH_PERSISTENCE = "memory";

    try {
      moduleRef = await Test.createTestingModule({
        imports: [AuthApiModule],
      }).compile();

      expect(moduleRef.get(BaseHealthController)).toBeInstanceOf(
        BaseHealthController,
      );
      expect(moduleRef.get(HealthService).appName).toBe("auth-app-api");
      expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
    } finally {
      delete process.env.AUTH_PERSISTENCE;
      await moduleRef?.close();
    }
  });
});
