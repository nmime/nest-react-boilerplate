import { Migration } from '@mikro-orm/migrations';
import {
  TenantScopedTablesByDomain,
  tenantAppRoleUpSql,
  tenantRegistryRowLevelSecurityDownSql,
  tenantRegistryRowLevelSecurityUpSql,
  tenantRowLevelSecurityDownSql,
  tenantRowLevelSecurityUpSql,
} from '@app/backend-postgres-main';

/**
 * Turns tenant isolation for the auth-owned tables from an application
 * convention into a database guarantee.
 *
 * Before this, a repository method that forgot its `tenant_id` predicate returned
 * other tenants' rows and nothing failed. Now each table carries a policy keyed on
 * `current_setting('app.current_tenant', true)`, enforced with `FORCE ROW LEVEL
 * SECURITY` so it applies to the owner too, and the runtime connects as a
 * restricted non-`BYPASSRLS` role.
 *
 * Scoped to this domain's tables on purpose: the notification and feature-flag
 * migration sets run independently, so a table they create does not exist yet
 * here. Each of them installs its own policies with the same shared SQL.
 */
export class Migration20260803120000TenantRowLevelSecurity extends Migration {
  override up(): void {
    for (const statement of tenantAppRoleUpSql()) {
      this.addSql(statement);
    }

    for (const table of TenantScopedTablesByDomain.auth) {
      for (const statement of tenantRowLevelSecurityUpSql(table)) {
        this.addSql(statement);
      }
    }

    // The registry keys on its own primary key rather than a tenant_id column.
    for (const statement of tenantRegistryRowLevelSecurityUpSql()) {
      this.addSql(statement);
    }
  }

  override down(): void {
    for (const statement of tenantRegistryRowLevelSecurityDownSql()) {
      this.addSql(statement);
    }

    for (const table of TenantScopedTablesByDomain.auth) {
      for (const statement of tenantRowLevelSecurityDownSql(table)) {
        this.addSql(statement);
      }
    }

    // The role is intentionally left in place: the other domains' policies still
    // reference it, and dropping a role that owns grants elsewhere fails.
  }
}
