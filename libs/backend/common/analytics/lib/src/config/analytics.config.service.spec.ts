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
      provider: "noop",
      plugins: [plugin],
    });

    expect(service.appName).toBe("configured-app");
    expect(service.environment).toBe("test");
    expect(service.enabled).toBe(false);
    expect(service.plugins.map((item) => item.name)).toEqual([
      "custom",
      "noop",
    ]);
  });

  it("reads defaults from analytics environment variables", () => {
    vi.stubEnv("ANALYTICS_APP_NAME", "env-app");
    vi.stubEnv("ANALYTICS_ENVIRONMENT", "staging");
    vi.stubEnv("ANALYTICS_ENABLED", "false");

    const service = new AnalyticsConfigService();

    expect(service.appName).toBe("env-app");
    expect(service.environment).toBe("staging");
    expect(service.enabled).toBe(false);
    expect(service.plugins.map((plugin) => plugin.name)).toEqual(["noop"]);
  });

  it("creates GA4, PostHog, and Umami plugins when credentials are present", () => {
    vi.stubEnv("ANALYTICS_PROVIDERS", "ga4,posthog,umami");
    vi.stubEnv("ANALYTICS_GA4_MEASUREMENT_ID", "G-TEST");
    vi.stubEnv("ANALYTICS_GA4_API_SECRET", "secret");
    vi.stubEnv("ANALYTICS_POSTHOG_API_KEY", "ph-key");
    vi.stubEnv("ANALYTICS_POSTHOG_HOST", "https://posthog.example.com");
    vi.stubEnv("ANALYTICS_UMAMI_WEBSITE_ID", "website-id");
    vi.stubEnv(
      "ANALYTICS_UMAMI_ENDPOINT",
      "https://umami.example.com/api/send",
    );

    const service = new AnalyticsConfigService();

    expect(service.ga4MeasurementId).toBe("G-TEST");
    expect(service.ga4ApiSecret).toBe("secret");
    expect(service.postHogApiKey).toBe("ph-key");
    expect(service.postHogHost).toBe("https://posthog.example.com");
    expect(service.umamiWebsiteId).toBe("website-id");
    expect(service.umamiEndpoint).toBe("https://umami.example.com/api/send");
    expect(service.plugins.map((plugin) => plugin.name)).toEqual([
      "ga4-measurement-protocol",
      "posthog",
      "umami",
    ]);
  });

  it("auto-detects provider credentials without exposing secret values", () => {
    vi.stubEnv("ANALYTICS_POSTHOG_API_KEY", "ph-key");

    const service = new AnalyticsConfigService();

    expect(service.providers).toBeUndefined();
    expect(service.plugins.map((plugin) => plugin.name)).toEqual(["posthog"]);
  });

  it("throws on malformed boolean and provider environment values", () => {
    vi.stubEnv("ANALYTICS_ENABLED", "maybe");

    expect(() => new AnalyticsConfigService().enabled).toThrow(
      /Invalid environment configuration.*ANALYTICS_ENABLED/u,
    );

    vi.unstubAllEnvs();
    vi.stubEnv("ANALYTICS_PROVIDER", "unknown");

    expect(() => new AnalyticsConfigService().provider).toThrow(
      /Invalid environment configuration.*ANALYTICS_PROVIDER/u,
    );
  });
});
