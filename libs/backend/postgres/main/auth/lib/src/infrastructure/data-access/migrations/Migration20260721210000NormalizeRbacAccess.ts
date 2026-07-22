import { Migration } from '@mikro-orm/migrations';
import {
  AdminNotificationBroadcastsApprovePermission,
  AdminNotificationBroadcastsReadPermission,
  AdminNotificationBroadcastsSendPermission,
  AdminNotificationBroadcastsWritePermission,
  AdminNotificationSegmentsReadPermission,
  AdminNotificationSegmentsWritePermission,
  AdminNotificationTemplatesReadPermission,
  AdminNotificationTemplatesTestPermission,
  AdminNotificationTemplatesWritePermission,
  defaultRolePermissions,
  permissionCatalog,
  roleKeys,
} from '@app/common-authz';

const DefaultTenantId = '00000000-0000-0000-0000-000000000000';

const sqlText = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const roleLabel = (key: string): string => (key.length > 0 ? `${key.charAt(0).toUpperCase()}${key.slice(1)}` : key);

// These grants were added after the original RBAC migration. Keep the list
// explicit so a future catalog change never changes this historical migration.
const introducedAdminPermissions = [
  AdminNotificationTemplatesReadPermission,
  AdminNotificationTemplatesWritePermission,
  AdminNotificationTemplatesTestPermission,
  AdminNotificationSegmentsReadPermission,
  AdminNotificationSegmentsWritePermission,
  AdminNotificationBroadcastsReadPermission,
  AdminNotificationBroadcastsWritePermission,
  AdminNotificationBroadcastsSendPermission,
  AdminNotificationBroadcastsApprovePermission,
] as const;

/**
 * Completes the normalized RBAC model for already-migrated installations.
 *
 * `auth_user_roles`, `auth_role_permissions`, and `auth_user_permissions` are
 * the authorization source of truth. This migration reads the former JSON
 * arrays only to backfill normalized grants; the following cleanup migration
 * removes those retired columns.
 */
export class Migration20260721210000NormalizeRbacAccess extends Migration {
  override up(): void {
    // The existing user/role joins carry tenant_id but originally only had
    // single-column foreign keys. Add composite uniqueness first, then bind
    // each assignment to a user and role from that same tenant at the DB layer.
    this.addSql(`
      do $$
      begin
        if not exists (select 1 from pg_constraint where conname = 'uq__auth_users__id_tenant_id') then
          alter table "auth_users" add constraint "uq__auth_users__id_tenant_id" unique ("id", "tenant_id");
        end if;
        if not exists (select 1 from pg_constraint where conname = 'uq__auth_roles__id_tenant_id') then
          alter table "auth_roles" add constraint "uq__auth_roles__id_tenant_id" unique ("id", "tenant_id");
        end if;
      end $$;
    `);
    this.addSql(`
      create table if not exists "auth_user_permissions" (
        "auth_user_id" uuid not null,
        "permission_id" uuid not null,
        "tenant_id" uuid not null default ${sqlText(DefaultTenantId)},
        "granted_by_user_id" uuid null,
        "created_at" timestamptz not null default now(),
        constraint "pk__auth_user_permissions" primary key ("auth_user_id", "permission_id"),
        constraint "fk__auth_user_permissions__auth_user_id_tenant_id" foreign key ("auth_user_id", "tenant_id") references "auth_users" ("id", "tenant_id") on delete cascade,
        constraint "fk__auth_user_permissions__permission_id" foreign key ("permission_id") references "auth_permissions" ("id") on delete cascade,
        constraint "fk__auth_user_permissions__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_user_permissions__permission_id" on "auth_user_permissions" ("permission_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_user_permissions__tenant_id" on "auth_user_permissions" ("tenant_id");',
    );
    this.addSql(`
      do $$
      begin
        if not exists (select 1 from pg_constraint where conname = 'fk__auth_user_roles__auth_user_id_tenant_id') then
          alter table "auth_user_roles"
            add constraint "fk__auth_user_roles__auth_user_id_tenant_id"
            foreign key ("auth_user_id", "tenant_id") references "auth_users" ("id", "tenant_id") on delete cascade;
        end if;
        if not exists (select 1 from pg_constraint where conname = 'fk__auth_user_roles__role_id_tenant_id') then
          alter table "auth_user_roles"
            add constraint "fk__auth_user_roles__role_id_tenant_id"
            foreign key ("role_id", "tenant_id") references "auth_roles" ("id", "tenant_id") on delete cascade;
        end if;
      end $$;
    `);

    const permissionValues = permissionCatalog
      .map(
        (permission) =>
          `(gen_random_uuid(), ${sqlText(permission.key)}, ${sqlText(permission.resource)}, ${sqlText(permission.action)}, ${sqlText(permission.description)}, now())`,
      )
      .join(', ');
    this.addSql(
      `insert into "auth_permissions" ("id", "key", "resource", "action", "description", "created_at") values ${permissionValues} ` +
        `on conflict ("key") do update set "resource" = excluded."resource", "action" = excluded."action", "description" = excluded."description";`,
    );

    const systemRoleRows = roleKeys.map((key) => `(${sqlText(key)}, ${sqlText(roleLabel(key))})`).join(', ');
    this.addSql(
      `insert into "auth_roles" ("id", "tenant_id", "key", "label", "description", "is_system", "created_at", "updated_at") ` +
        `select gen_random_uuid(), tenants."tenant_id", system_roles."key", system_roles."label", '', true, now(), now() ` +
        `from (select "id" as "tenant_id" from "auth_tenants" union select distinct "tenant_id" from "auth_users" union select distinct "tenant_id" from "auth_roles" union select ${sqlText(DefaultTenantId)}::uuid) tenants ` +
        `cross join (values ${systemRoleRows}) as system_roles("key", "label") ` +
        `on conflict ("tenant_id", "key") do nothing;`,
    );

    // The original model only seeded grants for the default tenant. Reconcile
    // every protected system role for every discovered tenant so a legacy user
    // assigned to `admin` or `user` resolves the same canonical permissions
    // regardless of when that tenant was first created. Custom roles are never
    // touched by this repair.
    for (const key of roleKeys) {
      const permissionKeys = defaultRolePermissions[key].map(sqlText).join(', ');
      this.addSql(
        `insert into "auth_role_permissions" ("role_id", "permission_id", "created_at") ` +
          `select r."id", p."id", now() from "auth_roles" r cross join "auth_permissions" p ` +
          `where r."is_system" = true and r."key" = ${sqlText(key)} and p."key" in (${permissionKeys}) on conflict do nothing;`,
      );
    }

    // Earlier versions only backfilled assignments against roles that existed
    // then. Reconcile missing system-role links now that every tenant has the
    // system role rows required to resolve them.
    this.addSql(
      `insert into "auth_user_roles" ("auth_user_id", "role_id", "tenant_id", "created_at") ` +
        `select u."id", r."id", u."tenant_id", now() from "auth_users" u ` +
        `cross join lateral jsonb_array_elements_text(coalesce(u."roles", '[]'::jsonb)) as legacy_roles("key") ` +
        `join "auth_roles" r on r."tenant_id" = u."tenant_id" and r."key" = legacy_roles."key" ` +
        `on conflict do nothing;`,
    );

    // Persist legacy per-user grants as direct normalized grants only when the
    // permission is not already inherited through a normalized role. This
    // preserves explicit exceptions without turning every inherited grant into
    // an override that would survive future role revocation.
    this.addSql(
      `insert into "auth_user_permissions" ("auth_user_id", "permission_id", "tenant_id", "created_at") ` +
        `select distinct u."id", p."id", u."tenant_id", now() from "auth_users" u ` +
        `cross join lateral jsonb_array_elements_text(coalesce(u."permissions", '[]'::jsonb)) as legacy_permissions("key") ` +
        `join "auth_permissions" p on p."key" = legacy_permissions."key" ` +
        `where not exists (select 1 from "auth_user_roles" ur ` +
        `join "auth_role_permissions" rp on rp."role_id" = ur."role_id" ` +
        `where ur."auth_user_id" = u."id" and ur."tenant_id" = u."tenant_id" and rp."permission_id" = p."id") ` +
        `on conflict do nothing;`,
    );
  }

  override down(): void {
    this.addSql('drop table if exists "auth_user_permissions" cascade;');
    this.addSql(
      'alter table "auth_user_roles" drop constraint if exists "fk__auth_user_roles__auth_user_id_tenant_id";',
    );
    this.addSql('alter table "auth_user_roles" drop constraint if exists "fk__auth_user_roles__role_id_tenant_id";');
    this.addSql('alter table "auth_users" drop constraint if exists "uq__auth_users__id_tenant_id";');
    this.addSql('alter table "auth_roles" drop constraint if exists "uq__auth_roles__id_tenant_id";');
    const introducedPermissionValues = introducedAdminPermissions.map(sqlText).join(', ');
    this.addSql(
      `delete from "auth_role_permissions" rp using "auth_permissions" p ` +
        `where rp."permission_id" = p."id" and p."key" in (${introducedPermissionValues});`,
    );
    this.addSql(`delete from "auth_permissions" where "key" in (${introducedPermissionValues});`);
  }
}
