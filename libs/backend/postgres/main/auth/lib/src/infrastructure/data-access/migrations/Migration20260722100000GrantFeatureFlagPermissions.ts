import { Migration } from '@mikro-orm/migrations';
import {
  AdminFeatureFlagsReadPermission,
  AdminFeatureFlagsWritePermission,
  AdminRole,
  basePermissionCatalog,
} from '@app/common-authz';

const sqlText = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const featureFlagPermissions = [AdminFeatureFlagsReadPermission, AdminFeatureFlagsWritePermission].map((key) => {
  const permission = basePermissionCatalog.find((entry) => entry.key === key);
  if (!permission) {
    throw new Error(`Feature flag permission ${key} is missing from the shared catalog.`);
  }
  return permission;
});

/** Backfills feature-flag grants for databases that seeded RBAC before the
 * admin feature-flags module existed. Fresh databases remain idempotent. */
export class Migration20260722100000GrantFeatureFlagPermissions extends Migration {
  override up(): void {
    for (const permission of featureFlagPermissions) {
      this.addSql(
        `insert into "auth_permissions" ("id", "key", "resource", "action", "description", "created_at") ` +
          `values (gen_random_uuid(), ${sqlText(permission.key)}, ${sqlText(permission.resource)}, ` +
          `${sqlText(permission.action)}, ${sqlText(permission.description)}, now()) ` +
          `on conflict ("key") do update set "resource" = excluded."resource", ` +
          `"action" = excluded."action", "description" = excluded."description";`,
      );
      this.addSql(
        `insert into "auth_role_permissions" ("role_id", "permission_id", "created_at") ` +
          `select r."id", p."id", now() from "auth_roles" r cross join "auth_permissions" p ` +
          `where r."key" = ${sqlText(AdminRole)} and p."key" = ${sqlText(permission.key)} ` +
          `on conflict do nothing;`,
      );
    }
  }

  override down(): void {
    const permissionKeys = featureFlagPermissions.map(({ key }) => sqlText(key)).join(', ');
    this.addSql(
      `delete from "auth_role_permissions" rp using "auth_permissions" p ` +
        `where rp."permission_id" = p."id" and p."key" in (${permissionKeys});`,
    );
    this.addSql(`delete from "auth_permissions" where "key" in (${permissionKeys});`);
  }
}
