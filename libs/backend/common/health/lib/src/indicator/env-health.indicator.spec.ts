import { describe, expect, it } from "vitest";
import { EnvHealthIndicator } from "./env-health.indicator";

describe("EnvHealthIndicator", () => {
  it("skips when no variables are configured", () => {
    expect(new EnvHealthIndicator().check()).toEqual({
      name: "env",
      status: "skipped",
      required: false,
      details: { reason: "no env variables configured" },
    });
  });

  it("reports presence counts and missing keys without exposing values", () => {
    expect(
      new EnvHealthIndicator({
        env: { PRESENT: "value", OPTIONAL: "" },
        requiredVariables: ["PRESENT", "MISSING"],
        optionalVariables: ["OPTIONAL"],
      }).check(),
    ).toEqual({
      name: "env",
      status: "error",
      required: true,
      details: {
        requiredConfigured: 1,
        requiredTotal: 2,
        optionalConfigured: 0,
        optionalTotal: 1,
        missingRequired: ["MISSING"],
        missingOptional: ["OPTIONAL"],
      },
    });
  });
});
