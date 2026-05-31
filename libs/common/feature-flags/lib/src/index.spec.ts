import { describe, expect, it } from "vitest";
import {
  EnvironmentFeatureFlagProvider,
  StaticFeatureFlagProvider,
  readEnvironmentFlags,
} from "./index";

describe("feature flags", () => {
  it("evaluates static boolean-like values", () => {
    const provider = new StaticFeatureFlagProvider({
      "billing.portal": true,
      "admin.audit": "off",
      "rollout.percent": 25,
    });

    expect(provider.isEnabled("billing.portal")).toBe(true);
    expect(provider.isEnabled("admin.audit")).toBe(false);
    expect(provider.getValue("rollout.percent", 0)).toBe(25);
    expect(provider.getValue("missing", "fallback")).toBe("fallback");
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
});
