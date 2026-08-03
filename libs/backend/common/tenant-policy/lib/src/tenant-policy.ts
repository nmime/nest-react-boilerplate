/**
 * Postgres tenant row-level-security DDL.
 *
 * This lib exists to be a LEAF. The migrations that install these policies run
 * inside the pruned migrator image, and importing them from the durable-provider
 * barrel pulled that barrel's whole Nest module graph along — the migrator then
 * died with `Cannot find module '@fastify/cookie'`. Keeping the statements here,
 * with no imports at all, means a migration can reach them without dragging a web
 * framework into a database container.
 *
 * The file therefore names no provider package: `checkProviderScopedRuntimeImports`
 * greps `libs/backend/common/**` for those tokens, comments included.
 */

/** Postgres GUC the policies read via `current_setting(..., true)`. */
export const TenantContextGuc = 'app.current_tenant';

/**
 * Restricted, non-`BYPASSRLS` role every tenant-scoped statement runs as.
 *
 * `FORCE ROW LEVEL SECURITY` still exempts a table's owner and any `BYPASSRLS`
 * role, so running as the pool's superuser silently disables every policy.
 */
export const TenantAppRole = process.env['POSTGRES_APP_ROLE'] ?? 'nrb_app';

/**
 * Tenant-scoped tables grouped by the migration set that CREATES them.
 *
 * Each domain installs policies for its own tables, because the migration sets
 * run independently: one cross-domain migration in `auth` fails with
 * `relation "notification_broadcasts" does not exist`, since the notification
 * tables do not exist yet at that point.
 *
 * A tenant-scoped table missing from here has no policy and leaks across
 * tenants, so adding a `tenant_id` column means adding the table here.
 * `tenant-policy.spec.ts` scans the entity sources and fails if one is absent.
 */
export const TenantScopedTablesByDomain = {
  // `feature_flags` is grouped with auth because the auth set is what creates it:
  // it re-exports `Migration20260609100000CreateFeatureFlags`, and the
  // feature-flags set's own array is referenced only by its tests.
  auth: [
    'admin_audit_logs',
    'auth_external_identities',
    'auth_link_tokens',
    'auth_login_events',
    'auth_methods',
    'auth_provider_tokens',
    'auth_roles',
    'auth_tenant_invitations',
    'auth_tenant_memberships',
    'auth_user_permissions',
    'auth_user_roles',
    'auth_user_tokens',
    'auth_users',
    'feature_flags',
    'problem_presentation_overrides',
    'transactional_outbox_events',
  ],
  notification: ['notification_broadcasts', 'notification_segments', 'notification_templates'],
} as const satisfies Record<string, readonly string[]>;

/** Every tenant-scoped table, for tests that assert complete coverage. */
export const TenantScopedTables = Object.values(TenantScopedTablesByDomain).flat();

/**
 * The tenant registry itself, whose own `id` IS the tenant — it carries no
 * `tenant_id` column, so it needs a policy keyed on the primary key instead.
 *
 * Without this, any tenant could read the whole registry. Listing a user's
 * tenants legitimately spans tenants and therefore goes through the system
 * (`BYPASSRLS`) connection.
 */
export const TenantRegistryTable = 'auth_tenants';

const isolationPredicate = (column: string): string =>
  `"${column}" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid`;

const enablePolicySql = (table: string, column: string): string[] => [
  `grant select, insert, update, delete on "${table}" to "${TenantAppRole}";`,
  `alter table "${table}" enable row level security;`,
  // Without FORCE, the table owner bypasses its own policies — the usual reason
  // an RLS setup passes review and protects nothing.
  `alter table "${table}" force row level security;`,
  `drop policy if exists "${table}_tenant_isolation" on "${table}";`,
  `create policy "${table}_tenant_isolation" on "${table}" ` +
    `using (${isolationPredicate(column)}) with check (${isolationPredicate(column)});`,
];

/**
 * SQL that puts one table under fail-closed tenant row-level security.
 *
 * The predicate is `nullif(current_setting(...), '')::uuid`, which is NULL when no
 * tenant is set — and `tenant_id = NULL` matches nothing, so absence of a tenant
 * yields no rows rather than every row.
 */
export function tenantRowLevelSecurityUpSql(table: string): string[] {
  return enablePolicySql(table, 'tenant_id');
}

/** Reverses {@link tenantRowLevelSecurityUpSql} for one table. */
export function tenantRowLevelSecurityDownSql(table: string): string[] {
  return [
    `drop policy if exists "${table}_tenant_isolation" on "${table}";`,
    `alter table "${table}" no force row level security;`,
    `alter table "${table}" disable row level security;`,
    `revoke all on "${table}" from "${TenantAppRole}";`,
  ];
}

/** Fail-closed policy for {@link TenantRegistryTable}, keyed on `id`. */
export function tenantRegistryRowLevelSecurityUpSql(): string[] {
  return enablePolicySql(TenantRegistryTable, 'id');
}

/** Reverses {@link tenantRegistryRowLevelSecurityUpSql}. */
export function tenantRegistryRowLevelSecurityDownSql(): string[] {
  return tenantRowLevelSecurityDownSql(TenantRegistryTable);
}

/**
 * SQL creating the restricted role. Idempotent, and safe to emit from more than
 * one domain's migration since each runs independently.
 */
export function tenantAppRoleUpSql(): string[] {
  return [
    `do $$ begin
         if not exists (select 1 from pg_roles where rolname = '${TenantAppRole}') then
           create role "${TenantAppRole}" nologin nobypassrls;
         end if;
       end $$;`,
    `grant usage on schema public to "${TenantAppRole}";`,
    `grant usage, select on all sequences in schema public to "${TenantAppRole}";`,
  ];
}
