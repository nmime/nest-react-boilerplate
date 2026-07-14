import { Migration } from '@mikro-orm/migrations';
import { AdminRole, AdminRolesWritePermission } from '@app/common-authz';

// Wrap a value as a single-quoted SQL string literal, doubling embedded quotes.
const sqlText = (value: string): string => `'${value.replace(/'/g, "''")}'`;

// RBAC Phase 3 grants `admin:roles:write` to the `admin` role. The base RBAC
// migration (Migration20260704120000CreateRbacModel) seeds role grants from the
// shared matrix on first run only, so databases already migrated before this
// grant landed will not have the row. This idempotent, data-only migration
// inserts the missing `admin -> admin:roles:write` grant for every `admin` role
// (all tenants); the `on conflict do nothing` clause makes it a no-op on
// databases seeded after the matrix change.
export class Migration20260704130000GrantAdminRolesWrite extends Migration {
  override up(): void {
    this.addSql(
      `insert into "auth_role_permissions" ("role_id", "permission_id", "created_at") ` +
        `select r."id", p."id", now() from "auth_roles" r ` +
        `cross join "auth_permissions" p ` +
        `where r."key" = ${sqlText(AdminRole)} ` +
        `and p."key" = ${sqlText(AdminRolesWritePermission)} on conflict do nothing;`,
    );
  }

  override down(): void {
    this.addSql(
      `delete from "auth_role_permissions" rp ` +
        `using "auth_roles" r, "auth_permissions" p ` +
        `where rp."role_id" = r."id" and rp."permission_id" = p."id" ` +
        `and r."key" = ${sqlText(AdminRole)} ` +
        `and p."key" = ${sqlText(AdminRolesWritePermission)};`,
    );
  }
}
