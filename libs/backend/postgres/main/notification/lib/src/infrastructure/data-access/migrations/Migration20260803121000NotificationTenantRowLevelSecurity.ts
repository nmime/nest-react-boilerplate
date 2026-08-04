import { Migration } from '@mikro-orm/migrations';
import {
  TenantScopedTablesByDomain,
  TenantSharedTierTablesByDomain,
  tenantAppRoleUpSql,
  tenantRowLevelSecurityDownSql,
  tenantRowLevelSecurityUpSql,
  tenantSharedTierRowLevelSecurityUpSql,
} from '@app/backend-common-tenant-policy';

/**
 * Installs fail-closed tenant row-level security on the notification-owned
 * tenant-scoped tables, using the same shared SQL as the auth domain.
 *
 * Lives here rather than in one cross-domain migration because the migration sets
 * run independently — these tables do not exist while the auth set is running.
 * Creating the restricted role is idempotent, so emitting it from both is safe
 * whichever set runs first.
 *
 * `notification_templates` takes the shared-tier policy rather than the strict
 * one. Its own CHECK constraint requires `tenant_id is null` for every
 * `source = 'code'` row, so under the strict predicate — NULL, not false — every
 * built-in template is invisible to every tenant and a fresh one cannot be
 * inserted at all.
 */
export class Migration20260803121000NotificationTenantRowLevelSecurity extends Migration {
  override up(): void {
    for (const statement of tenantAppRoleUpSql()) {
      this.addSql(statement);
    }

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

  override down(): void {
    for (const table of [...TenantScopedTablesByDomain.notification, ...TenantSharedTierTablesByDomain.notification]) {
      for (const statement of tenantRowLevelSecurityDownSql(table)) {
        this.addSql(statement);
      }
    }
  }
}
