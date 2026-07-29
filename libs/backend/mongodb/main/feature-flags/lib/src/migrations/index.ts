import { Migration20260726000300InitializeFeatureFlags } from './Migration20260726000300InitializeFeatureFlags';

export * from './Migration20260726000300InitializeFeatureFlags';

export const featureFlagMongoMigrations = [Migration20260726000300InitializeFeatureFlags] as const;
