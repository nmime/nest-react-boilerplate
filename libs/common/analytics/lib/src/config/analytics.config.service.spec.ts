import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsConfigService } from "./analytics.config.service";
import type { AnalyticsPlugin } from "../type";

describe("AnalyticsConfigService", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses explicit module options before environment values", () => {
    vi.stubEnv("ANALYTICS_APP_NAME", "env-app");
    vi.stubEnv("ANALYTICS_ENVIRONMENT", "production");
    vi.stubEnv("ANALYTICS_ENABLED", "true");

    const plugin: AnalyticsPlugin = { name: "custom" };
    const service = new AnalyticsConfigService({
      appName: "configured-app",
      environment: "test",
      enabled: false,
      plugins: [plugin],
    });

    expect(service.appName).toBe("configured-app");
    expect(service.environment).toBe("test");
    expect(service.enabled).toBe(false);
    expect(service.plugins).toEqual([plugin]);
  });

  it("reads defaults from analytics environment variables", () => {
    vi.stubEnv("ANALYTICS_APP_NAME", "env-app");
    vi.stubEnv("ANALYTICS_ENVIRONMENT", "staging");
    vi.stubEnv("ANALYTICS_ENABLED", "false");

    const service = new AnalyticsConfigService();

    expect(service.appName).toBe("env-app");
    expect(service.environment).toBe("staging");
    expect(service.enabled).toBe(false);
    expect(service.plugins).toEqual([]);
  });

  it("creates a GA4 plugin when measurement protocol credentials are present", () => {
    vi.stubEnv("ANALYTICS_GA4_MEASUREMENT_ID", "G-TEST");
    vi.stubEnv("ANALYTICS_GA4_API_SECRET", "secret");

    const service = new AnalyticsConfigService();

    expect(service.ga4MeasurementId).toBe("G-TEST");
    expect(service.ga4ApiSecret).toBe("secret");
    expect(service.plugins).toHaveLength(1);
    expect(service.plugins[0]?.name).toBe("ga4-measurement-protocol");
  });

  it("throws on malformed boolean environment values", () => {
    vi.stubEnv("ANALYTICS_ENABLED", "maybe");

    const service = new AnalyticsConfigService();

    expect(() => service.enabled).toThrow(
      "Invalid boolean config ANALYTICS_ENABLED: maybe",
    );
  });
});
