import type { MigrationsOptions } from "@mikro-orm/core";
import { Migration20260516152000CreateAuthUsers } from "./Migration20260516152000CreateAuthUsers";
import { Migration20260517141000AddAuthUserLocale } from "./Migration20260517141000AddAuthUserLocale";

export const AuthMigrationsTableName = "mikro_orm_migrations";

export const authMigrations = [
  Migration20260516152000CreateAuthUsers,
  Migration20260517141000AddAuthUserLocale,
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
};
