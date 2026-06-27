import { describe, expect, it } from "vitest";
import * as featureFlagsPostgres from "./index";

describe("feature flags postgres exports", () => {
  it("exports public feature-flag data-access APIs", () => {
    expect(featureFlagsPostgres.FeatureFlagsPostgresModule).toBeDefined();
    expect(featureFlagsPostgres.PostgresFeatureFlagProvider).toBeDefined();
    expect(featureFlagsPostgres.FeatureFlagEntity).toBeDefined();
    expect(featureFlagsPostgres.FeatureFlagEntitySchema).toBeDefined();
    expect(featureFlagsPostgres.FeatureFlagRepository).toBeDefined();
    expect(featureFlagsPostgres.featureFlagMigrations.length).toBeGreaterThan(
      0,
    );
  });
});
