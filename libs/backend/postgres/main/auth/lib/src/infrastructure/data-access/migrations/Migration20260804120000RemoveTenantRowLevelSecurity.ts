import { Migration } from '@mikro-orm/migrations';
import {
  TenantAppRole,
  TenantScopedTablesByDomain,
  tenantAppRoleUpSql,
  tenantRegistryRowLevelSecurityDownSql,
  tenantRowLevelSecurityDownSql,
} from '@app/backend-common-tenant-policy';

/**
 * Reverses the fail-closed tenant row-level-security policies that
 * `Migration20260803120000TenantRowLevelSecurity` previously installed on the
 * auth-owned tables.
 *
 * The original migration is no longer in the migration set, and MikroORM
 * records already-applied migrations by name — so this new migration name is
 * what actually removes the policies on databases that ran the original. On
 * databases that never ran it, every statement is a no-op (drop-policy-if-exists,
 * no-force, revoke). The reversal runs with the same superuser/owner role that
 * ran the original, so it can drop the policies and revoke the grants.
 *
 * Rationale: the policies shipped keyed on
 * `current_setting('app.current_tenant', true)` under `FORCE ROW LEVEL
 * SECURITY`, but no runtime path ever engaged them — nothing set the GUC or
 * switched to the restricted role, and every deployment connects as a
 * `BYPASSRLS`/superuser pool role. They therefore protected nothing, while any
 * future restricted-role connection would have made every auth query fail
 * closed with zero rows. Enforcement is rolled back until the runtime
 * engagement exists; see `docs/multi-tenancy-capability.md`.
 *
 * The `nrb_app` role itself is intentionally left in place: it is `NOLOGIN`,
 * and a future re-engagement migration can reuse it (its creation SQL stays
 * available as `tenantAppRoleUpSql()`).
 */
export class Migration20260804120000RemoveTenantRowLevelSecurity extends Migration {
  override up(): void {
    // The revoke statements below reference the restricted role. On a fresh
    // database the original policy migration never ran, so the role may not
    // exist — re-create it idempotently (NOLOGIN, harmless) to keep every
    // statement a no-op there.
    for (const statement of tenantAppRoleUpSql()) {
      this.addSql(statement);
    }

    for (const statement of tenantRegistryRowLevelSecurityDownSql()) {
      this.addSql(statement);
    }

    for (const table of TenantScopedTablesByDomain.auth) {
      for (const statement of tenantRowLevelSecurityDownSql(table)) {
        this.addSql(statement);
      }
    }

    this.addSql(`-- role "${TenantAppRole}" intentionally left in place (nologin, nobypassrls).`);
  }

  override down(): void {
    // Leave policies removed. Re-installing them here would block earlier
    // migrations from dropping tenant_id during `migrator.down({ to: 0 })`.
  }
}
