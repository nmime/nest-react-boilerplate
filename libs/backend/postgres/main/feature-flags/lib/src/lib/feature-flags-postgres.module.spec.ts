import { describe, expect, it } from "vitest";
import { FeatureFlagProviderToken } from "@app/common/feature-flags";
import { FeatureFlagEntity } from "./infrastructure/data-access/entities";
import { PostgresFeatureFlagProvider } from "./feature-flag-postgres.service";
import { FeatureFlagsPostgresModule } from "./feature-flags-postgres.module";
import { FeatureFlagRepository } from "./infrastructure/data-access/repositories";

describe("FeatureFlagsPostgresModule", () => {
  it("exposes DB-backed feature flag provider pieces", () => {
    expect(FeatureFlagsPostgresModule).toBeDefined();
    expect(FeatureFlagEntity).toBeDefined();
    expect(FeatureFlagRepository).toBeDefined();
    expect(PostgresFeatureFlagProvider).toBeDefined();
    expect(FeatureFlagProviderToken).toBe("app.feature-flags.provider");
  });
});
