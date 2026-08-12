import { Migration } from '@mikro-orm/migrations';
import { AdminAuthLoginAnalyticsReadPermission, AdminRole, basePermissionCatalog } from '@app/common-authz';

const sqlText = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const permission = (() => {
  const match = basePermissionCatalog.find((entry) => entry.key === AdminAuthLoginAnalyticsReadPermission);
  if (!match) {
    throw new Error('Auth login analytics permission is missing from the shared catalog.');
  }
  return match;
})();

/**
 * Adds the analytics permission to databases which ran the original RBAC seed
 * before this feature existed, then grants it to every tenant's system admin
 * role. Fresh databases safely hit the conflict clauses because the base RBAC
 * migration reads the current shared catalog.
 */
export class Migration20260721201000GrantAuthLoginAnalyticsRead extends Migration {
  override up(): void {
    this.addSql(
      `insert into "auth_permissions" ("id", "key", "resource", "action", "description", "created_at") ` +
        `values (gen_random_uuid(), ${sqlText(permission.key)}, ${sqlText(permission.resource)}, ` +
        `${sqlText(permission.action)}, ${sqlText(permission.description)}, now()) ` +
        `on conflict ("key") do update set "resource" = excluded."resource", ` +
        `"action" = excluded."action", "description" = excluded."description";`,
    );
    this.addSql(
      `insert into "auth_role_permissions" ("role_id", "permission_id", "created_at") ` +
        `select r."id", p."id", now() from "auth_roles" r ` +
        `cross join "auth_permissions" p ` +
        `where r."key" = ${sqlText(AdminRole)} ` +
        `and p."key" = ${sqlText(AdminAuthLoginAnalyticsReadPermission)} on conflict do nothing;`,
    );
  }

  override down(): void {
    this.addSql(
      `delete from "auth_role_permissions" rp using "auth_roles" r, "auth_permissions" p ` +
        `where rp."role_id" = r."id" and rp."permission_id" = p."id" ` +
        `and r."key" = ${sqlText(AdminRole)} ` +
        `and p."key" = ${sqlText(AdminAuthLoginAnalyticsReadPermission)};`,
    );
    this.addSql(`delete from "auth_permissions" where "key" = ${sqlText(AdminAuthLoginAnalyticsReadPermission)};`);
  }
}
