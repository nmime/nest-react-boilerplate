import { describe, expect, it } from "vitest";
import {
  EnvironmentFeatureFlagProvider,
  FeatureFlagModule,
  FeatureFlagProviderToken,
  InMemoryFeatureFlagProvider,
  createFeatureFlagProvider,
  readEnvironmentFlags,
} from "./index";

describe("feature flags", () => {
  it("evaluates in-memory boolean-like values for tests and fallback adapters", () => {
    const provider = new InMemoryFeatureFlagProvider({
      "billing.portal": true,
      "admin.audit": "off",
      "rollout.percent": 25,
    });

    expect(provider.isEnabled("billing.portal")).toBe(true);
    expect(provider.isEnabled("admin.audit")).toBe(false);
    expect(provider.getValue("rollout.percent", 0)).toBe(25);
    expect(provider.getValue("missing", "fallback")).toBe("fallback");
    expect(
      createFeatureFlagProvider({ "search.v2": "on" }).isEnabled("search.v2"),
    ).toBe(true);
  });

  it("normalizes environment variable flags", () => {
    expect(
      readEnvironmentFlags({
        FEATURE_BILLING_PORTAL: "true",
        FEATURE_ROLLOUT_PERCENT: "25",
        OTHER: "ignored",
      }),
    ).toEqual({ "billing.portal": true, "rollout.percent": 25 });

    expect(
      new EnvironmentFeatureFlagProvider({
        FEATURE_ADMIN_AUDIT: "yes",
      }).isEnabled("admin.audit"),
    ).toBe(true);
  });

  it("publishes a string injection token instead of a Symbol", () => {
    expect(FeatureFlagProviderToken).toBe("app.feature-flags.provider");
    expect(typeof FeatureFlagProviderToken).toBe("string");

    const provider = new InMemoryFeatureFlagProvider({
      "billing.portal": true,
    });
    const dynamicModule = FeatureFlagModule.forRoot({ provider });

    expect(dynamicModule.providers).toContainEqual({
      provide: FeatureFlagProviderToken,
      useValue: provider,
    });
    expect(dynamicModule.exports).toContainEqual({
      provide: FeatureFlagProviderToken,
      useValue: provider,
    });
  });
});
