import type { MigrationsOptions } from "@mikro-orm/core";
import { Migration20260516152000CreateAuthUsers } from "./Migration20260516152000CreateAuthUsers";
import { Migration20260517141000AddAuthUserLocale } from "./Migration20260517141000AddAuthUserLocale";
import { Migration20260518163000AddAuthUserTheme } from "./Migration20260518163000AddAuthUserTheme";
import { Migration20260525184500NormalizeAuthUserDatabaseStandards } from "./Migration20260525184500NormalizeAuthUserDatabaseStandards";
import { Migration20260531120000AddAuthUserTenantIsolation } from "./Migration20260531120000AddAuthUserTenantIsolation";
import { Migration20260531123000AddAuthTenantLifecycle } from "./Migration20260531123000AddAuthTenantLifecycle";
import { Migration20260601130000AddAuthTokenExpiryIndexes } from "./Migration20260601130000AddAuthTokenExpiryIndexes";
import { Migration20260605143000CreateAdminAuditLogs } from "./Migration20260605143000CreateAdminAuditLogs";

export const AuthMigrationsTableName = "mikro_orm_migrations";

export const authMigrations = [
  Migration20260516152000CreateAuthUsers,
  Migration20260517141000AddAuthUserLocale,
  Migration20260518163000AddAuthUserTheme,
  Migration20260525184500NormalizeAuthUserDatabaseStandards,
  Migration20260531120000AddAuthUserTenantIsolation,
  Migration20260531123000AddAuthTenantLifecycle,
  Migration20260601130000AddAuthTokenExpiryIndexes,
  Migration20260605143000CreateAdminAuditLogs,
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
  Migration20260531120000AddAuthUserTenantIsolation,
  Migration20260531123000AddAuthTenantLifecycle,
  Migration20260601130000AddAuthTokenExpiryIndexes,
  Migration20260605143000CreateAdminAuditLogs,
};
