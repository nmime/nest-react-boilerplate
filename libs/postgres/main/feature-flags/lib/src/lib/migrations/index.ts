import type { MigrationsOptions } from "@mikro-orm/core";
import { Migration20260609100000CreateFeatureFlags } from "./Migration20260609100000CreateFeatureFlags";

export const featureFlagMigrations = [
  Migration20260609100000CreateFeatureFlags,
] as const;

export const featureFlagMigrationOptions: MigrationsOptions = {
  tableName: "mikro_orm_migrations",
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...featureFlagMigrations],
};

export { Migration20260609100000CreateFeatureFlags };
