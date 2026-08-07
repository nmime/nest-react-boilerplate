import { Migration } from '@mikro-orm/migrations';
import {
  TenantAppRole,
  TenantScopedTablesByDomain,
  TenantSharedTierTablesByDomain,
  tenantAppRoleUpSql,
  tenantRowLevelSecurityDownSql,
  tenantRowLevelSecurityUpSql,
  tenantSharedTierRowLevelSecurityUpSql,
} from '@app/backend-common-tenant-policy';

/**
 * Reverses the fail-closed tenant row-level-security policies that
 * `Migration20260803121000NotificationTenantRowLevelSecurity` previously
 * installed on the notification-owned tables.
 *
 * The original migration is no longer in the migration set, and MikroORM
 * records already-applied migrations by name — so this new migration name is
 * what actually removes the policies on databases that ran the original. On
 * databases that never ran it, every statement is a no-op (drop-policy-if-exists,
 * no-force, revoke). The reversal runs with the same superuser/owner role that
 * ran the original, so it can drop the policies and revoke the grants.
 *
 * Rationale: the policies were never engaged at runtime — nothing ever set the
 * `app.current_tenant` GUC or switched to the restricted role, and every
 * deployment connects as a `BYPASSRLS`/superuser pool role — so they protected
 * nothing while any future restricted-role connection would have failed closed
 * with zero rows. See `docs/multi-tenancy-capability.md`.
 *
 * The `nrb_app` role is intentionally left in place: it is `NOLOGIN`, and the
 * auth-domain sibling reversal keeps it for the same reason.
 */
export class Migration20260804120000RemoveNotificationTenantRowLevelSecurity extends Migration {
  override up(): void {
    // The revoke statements below reference the restricted role. On a fresh
    // database the original policy migration never ran, so the role may not
    // exist — re-create it idempotently (NOLOGIN, harmless) to keep every
    // statement a no-op there.
    for (const statement of tenantAppRoleUpSql()) {
      this.addSql(statement);
    }

    // Both domains of tables the original install touched: the strict-policy
    // tables and the shared-tier ones (`notification_templates` — the original
    // gave it a policy whose using-check accepts shared rows). The reversal SQL
    // is identical for either shape, and every statement is a no-op when the
    // policy was never installed.
    for (const table of [...TenantScopedTablesByDomain.notification, ...TenantSharedTierTablesByDomain.notification]) {
      for (const statement of tenantRowLevelSecurityDownSql(table)) {
        this.addSql(statement);
      }
    }
    this.addSql(`-- role "${TenantAppRole}" intentionally left in place (nologin, nobypassrls).`);
  }

  override down(): void {
    // Rollback of the reversal = re-installing the fail-closed policies.
    // Required by the repo's migration rollback gate (up → down({to:0}) → up):
    // a migration whose down() throws breaks `migrator.down({ to: 0 })`.
    // The role is re-created idempotently in up(); here it already exists.
    for (const table of TenantScopedTablesByDomain.notification) {
      for (const statement of tenantRowLevelSecurityUpSql(table)) {
        this.addSql(statement);
      }
    }

    for (const table of TenantSharedTierTablesByDomain.notification) {
      for (const statement of tenantSharedTierRowLevelSecurityUpSql(table)) {
        this.addSql(statement);
      }
    }
  }
}
