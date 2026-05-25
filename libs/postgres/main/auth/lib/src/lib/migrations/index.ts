import type { MigrationsOptions } from "@mikro-orm/core";
import { Migration20260516152000CreateAuthUsers } from "./Migration20260516152000CreateAuthUsers";
import { Migration20260517141000AddAuthUserLocale } from "./Migration20260517141000AddAuthUserLocale";
import { Migration20260518163000AddAuthUserTheme } from "./Migration20260518163000AddAuthUserTheme";
import { Migration20260525184500NormalizeAuthUserDatabaseStandards } from "./Migration20260525184500NormalizeAuthUserDatabaseStandards";

export const AuthMigrationsTableName = "mikro_orm_migrations";

export const authMigrations = [
  Migration20260516152000CreateAuthUsers,
  Migration20260517141000AddAuthUserLocale,
  Migration20260518163000AddAuthUserTheme,
  Migration20260525184500NormalizeAuthUserDatabaseStandards,
] as const;

export const authMigrationOptions: MigrationsOptions = {
  tableName: AuthMigrationsTableName,
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...authMigrations],
};

export {
  Migration20260516152000CreateAuthUsers,
  Migration20260517141000AddAuthUserLocale,
  Migration20260518163000AddAuthUserTheme,
  Migration20260525184500NormalizeAuthUserDatabaseStandards,
};
