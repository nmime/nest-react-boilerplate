import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import {
  BaseHealthController,
  HealthService,
} from "@app/backend-common-health";
import { AuthController } from "@app/backend-feature-auth-main";
import { BETTER_AUTH_INSTANCE } from "@app/backend-feature-auth-main";
import { AuthAppApiModule } from "./auth-app-api.module";

const mockAuth = {
  api: {},
  handler: vi.fn(),
} as any;

describe("AuthAppApiModule", () => {
  it("wires the app, feature controllers, and shared health service", async () => {
    let moduleRef: TestingModule | undefined;
    process.env.AUTH_PERSISTENCE = "memory";

    try {
      moduleRef = await Test.createTestingModule({
        imports: [AuthAppApiModule],
      })
        .overrideProvider(BETTER_AUTH_INSTANCE)
        .useValue(mockAuth)
        .compile();

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
