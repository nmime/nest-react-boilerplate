import type { MigrationsOptions } from "@mikro-orm/core";
import { Migration20260516152000CreateAuthUsers } from "./Migration20260516152000CreateAuthUsers";
import { Migration20260517141000AddAuthUserLocale } from "./Migration20260517141000AddAuthUserLocale";
import { Migration20260518163000AddAuthUserTheme } from "./Migration20260518163000AddAuthUserTheme";
import { Migration20260525184500NormalizeAuthUserDatabaseStandards } from "./Migration20260525184500NormalizeAuthUserDatabaseStandards";
import { Migration20260531120000AddAuthUserTenantIsolation } from "./Migration20260531120000AddAuthUserTenantIsolation";
import { Migration20260531123000AddAuthTenantLifecycle } from "./Migration20260531123000AddAuthTenantLifecycle";
import { Migration20260601130000AddAuthTokenExpiryIndexes } from "./Migration20260601130000AddAuthTokenExpiryIndexes";
import { Migration20260605143000CreateAdminAuditLogs } from "./Migration20260605143000CreateAdminAuditLogs";
import { Migration20260606120000CreateTransactionalOutboxEvents } from "./Migration20260606120000CreateTransactionalOutboxEvents";
import { Migration20260607080000AlignAuthUserLocaleConstraint } from "./Migration20260607080000AlignAuthUserLocaleConstraint";
import { Migration20260609100000CreateFeatureFlags } from "@app/backend-postgres-main-feature-flags";
import { Migration20260614120000CreateSocialAuthDataModel } from "./Migration20260614120000CreateSocialAuthDataModel";
import { Migration20260704120000CreateRbacModel } from "./Migration20260704120000CreateRbacModel";
import { Migration20260704130000GrantAdminRolesWrite } from "./Migration20260704130000GrantAdminRolesWrite";

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
  Migration20260606120000CreateTransactionalOutboxEvents,
  Migration20260607080000AlignAuthUserLocaleConstraint,
  Migration20260609100000CreateFeatureFlags,
  Migration20260614120000CreateSocialAuthDataModel,
  Migration20260704120000CreateRbacModel,
  Migration20260704130000GrantAdminRolesWrite,
] as const;

export const authMigrationOptions: MigrationsOptions = {
  tableName: AuthMigrationsTableName,
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...authMigrations],
};

export * from "./Migration20260516152000CreateAuthUsers";
export * from "./Migration20260517141000AddAuthUserLocale";
export * from "./Migration20260518163000AddAuthUserTheme";
export * from "./Migration20260525184500NormalizeAuthUserDatabaseStandards";
export * from "./Migration20260531120000AddAuthUserTenantIsolation";
export * from "./Migration20260531123000AddAuthTenantLifecycle";
export * from "./Migration20260601130000AddAuthTokenExpiryIndexes";
export * from "./Migration20260605143000CreateAdminAuditLogs";
export * from "./Migration20260606120000CreateTransactionalOutboxEvents";
export * from "./Migration20260607080000AlignAuthUserLocaleConstraint";
export { Migration20260609100000CreateFeatureFlags } from "@app/backend-postgres-main-feature-flags";
export * from "./Migration20260614120000CreateSocialAuthDataModel";
export * from "./Migration20260704120000CreateRbacModel";
export * from "./Migration20260704130000GrantAdminRolesWrite";
