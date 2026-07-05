import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConfigModule } from "./analytics.config.module";
import { AnalyticsConfigService } from "./analytics.config.service";

describe("AnalyticsConfigModule", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("provides an AnalyticsConfigService built from the environment", async () => {
    vi.stubEnv("ANALYTICS_APP_NAME", "env-app");

    const moduleRef = await Test.createTestingModule({
      imports: [AnalyticsConfigModule],
    }).compile();

    const configService = moduleRef.get(AnalyticsConfigService);

    expect(configService).toBeInstanceOf(AnalyticsConfigService);
    expect(configService.appName).toBe("env-app");
  });
});
