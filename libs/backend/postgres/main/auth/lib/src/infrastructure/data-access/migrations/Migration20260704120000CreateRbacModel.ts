import { Migration } from '@mikro-orm/migrations';
// Versioned migrations bind to the *base* catalog, never the composed one: a migration that
// already ran must keep meaning what it meant, so a product registering extra permissions through
// `productAuthzExtensions` may not retroactively change the rows this file seeds. Product
// permissions and grants belong in a product-owned migration.
import { basePermissionCatalog, baseRoleKeys, baseRolePermissions } from '@app/common-authz';

const DefaultTenantId = '00000000-0000-0000-0000-000000000000';

// Wrap a value as a single-quoted SQL string literal, doubling embedded quotes
// so catalog descriptions such as "signed-in user's own profile" stay valid.
const sqlText = (value: string): string => `'${value.replace(/'/g, "''")}'`;

// Human-friendly default label derived from the role key (e.g. "admin" ->
// "Admin"); the catalog only ships keys, so we do not re-hardcode label data.
const roleLabel = (key: string): string => (key.length > 0 ? `${key.charAt(0).toUpperCase()}${key.slice(1)}` : key);

export class Migration20260704120000CreateRbacModel extends Migration {
  override up(): void {
    // Normalized RBAC source-of-truth tables. The denormalized
    // auth_users.roles/permissions jsonb caches are intentionally left in place
    // as the untouched hot path for this phase.
    this.addSql(`
      create table if not exists "auth_roles" (
        "id" uuid not null,
        "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "key" varchar(64) not null,
        "label" varchar(160) not null default '',
        "description" varchar(512) not null default '',
        "is_system" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__auth_roles" primary key ("id"),
        constraint "uq__auth_roles__tenant_id_key" unique ("tenant_id", "key")
      );
    `);
    this.addSql(`
      create table if not exists "auth_permissions" (
        "id" uuid not null,
        "key" varchar(128) not null,
        "resource" varchar(64) not null,
        "action" varchar(64) not null,
        "description" varchar(512) not null default '',
        "created_at" timestamptz not null default now(),
        constraint "pk__auth_permissions" primary key ("id"),
        constraint "uq__auth_permissions__key" unique ("key")
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_permissions__resource_action" on "auth_permissions" ("resource", "action");',
    );
    this.addSql(`
      create table if not exists "auth_role_permissions" (
        "role_id" uuid not null,
        "permission_id" uuid not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__auth_role_permissions" primary key ("role_id", "permission_id"),
        constraint "fk__auth_role_permissions__role_id" foreign key ("role_id") references "auth_roles" ("id") on delete cascade,
        constraint "fk__auth_role_permissions__permission_id" foreign key ("permission_id") references "auth_permissions" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_role_permissions__permission_id" on "auth_role_permissions" ("permission_id");',
    );
    this.addSql(`
      create table if not exists "auth_user_roles" (
        "auth_user_id" uuid not null,
        "role_id" uuid not null,
        "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "granted_by_user_id" uuid null,
        "created_at" timestamptz not null default now(),
        constraint "pk__auth_user_roles" primary key ("auth_user_id", "role_id"),
        constraint "fk__auth_user_roles__auth_user_id" foreign key ("auth_user_id") references "auth_users" ("id") on delete cascade,
        constraint "fk__auth_user_roles__role_id" foreign key ("role_id") references "auth_roles" ("id") on delete cascade
      );
    `);
    this.addSql('create index if not exists "ix__auth_user_roles__role_id" on "auth_user_roles" ("role_id");');
    this.addSql('create index if not exists "ix__auth_user_roles__tenant_id" on "auth_user_roles" ("tenant_id");');

    // Seed the global permission catalog straight from @app/common-authz so this
    // table never drifts from the shared source of truth.
    const permissionValues = basePermissionCatalog
      .map(
        (permission) =>
          `(gen_random_uuid(), ${sqlText(permission.key)}, ${sqlText(permission.resource)}, ${sqlText(permission.action)}, ${sqlText(permission.description)}, now())`,
      )
      .join(', ');
    this.addSql(
      `insert into "auth_permissions" ("id", "key", "resource", "action", "description", "created_at") values ${permissionValues} on conflict ("key") do nothing;`,
    );

    // Seed the system roles (user + admin) under the default tenant.
    const roleValues = baseRoleKeys
      .map(
        (key) =>
          `(gen_random_uuid(), ${sqlText(DefaultTenantId)}, ${sqlText(key)}, ${sqlText(roleLabel(key))}, '', true, now(), now())`,
      )
      .join(', ');
    this.addSql(
      `insert into "auth_roles" ("id", "tenant_id", "key", "label", "description", "is_system", "created_at", "updated_at") values ${roleValues} on conflict ("tenant_id", "key") do nothing;`,
    );

    // Seed role -> permission grants from the shared default matrix, joining on
    // keys so the concrete row ids stay decoupled from this migration.
    for (const key of baseRoleKeys) {
      const permissionList = baseRolePermissions[key].map((permissionKey) => sqlText(permissionKey)).join(', ');
      this.addSql(
        `insert into "auth_role_permissions" ("role_id", "permission_id", "created_at") ` +
          `select r."id", p."id", now() from "auth_roles" r ` +
          `cross join "auth_permissions" p ` +
          `where r."tenant_id" = ${sqlText(DefaultTenantId)} and r."key" = ${sqlText(key)} ` +
          `and p."key" in (${permissionList}) on conflict do nothing;`,
      );
    }

    // Backfill user role assignments from the denormalized auth_users.roles
    // jsonb cache: one row per (user, role) where the role key resolves to a
    // seeded role in the user's tenant.
    this.addSql(
      `insert into "auth_user_roles" ("auth_user_id", "role_id", "tenant_id", "created_at") ` +
        `select u."id", r."id", u."tenant_id", now() from "auth_users" u ` +
        `cross join lateral jsonb_array_elements_text(coalesce(u."roles", '[]'::jsonb)) as ur(role_key) ` +
        `join "auth_roles" r on r."tenant_id" = u."tenant_id" and r."key" = ur.role_key ` +
        `on conflict do nothing;`,
    );
  }

  override down(): void {
    // Reverse foreign-key dependency order; cascade removes each table's
    // indexes, constraints, and seeded rows so rollback leaves zero residue.
    this.addSql('drop table if exists "auth_user_roles" cascade;');
    this.addSql('drop table if exists "auth_role_permissions" cascade;');
    this.addSql('drop table if exists "auth_permissions" cascade;');
    this.addSql('drop table if exists "auth_roles" cascade;');
  }
}
