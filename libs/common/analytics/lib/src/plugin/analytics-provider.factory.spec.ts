import { describe, expect, it } from "vitest";
import { createAnalyticsProviderPlugins } from "./analytics-provider.factory";

describe("createAnalyticsProviderPlugins", () => {
  it("returns no provider plugins when nothing is configured", () => {
    expect(createAnalyticsProviderPlugins()).toEqual([]);
  });

  it("creates an explicit no-op provider", () => {
    expect(createAnalyticsProviderPlugins({ provider: "noop" })[0]?.name).toBe(
      "noop",
    );
  });

  it("falls back to no-op when an explicit provider is missing credentials", () => {
    expect(
      createAnalyticsProviderPlugins({ provider: "posthog" }).map(
        (plugin) => plugin.name,
      ),
    ).toEqual(["noop"]);
  });

  it("creates requested provider plugins with valid credentials", () => {
    expect(
      createAnalyticsProviderPlugins({
        providers: ["posthog", "umami"],
        posthog: { apiKey: "ph-key" },
        umami: { websiteId: "website-id", endpoint: "https://umami/api/send" },
      }).map((plugin) => plugin.name),
    ).toEqual(["posthog", "umami"]);
  });

  it("auto-detects configured providers", () => {
    expect(
      createAnalyticsProviderPlugins({
        posthog: { apiKey: "ph-key" },
      }).map((plugin) => plugin.name),
    ).toEqual(["posthog"]);
  });
});
