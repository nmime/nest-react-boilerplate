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
 * Restricted role every tenant-scoped statement runs as.
 *
 * Deterministic on purpose. Migration DDL is recorded in the ledger, so reading
 * the name from the environment would let one deployment install grants for a
 * role a second deployment never assumes — and the migrator and the application
 * could disagree about which role the policies name. Rename it at scaffold time
 * if you must, not at run time.
 */
export const TenantAppRole = 'nrb_app';

/**
 * Role that legitimately cross-tenant work runs as: accepting an invitation by
 * token, listing a user's tenants, login by email, billing rollups, and the
 * migrator's own data backfills.
 *
 * Note what this is NOT: a `BYPASSRLS` role. Only a role that already holds
 * `BYPASSRLS` may create another one, so a migration running as an ordinary
 * managed-Postgres owner cannot mint it — verified against PostgreSQL 17.6,
 * which answers `only roles with the BYPASSRLS attribute may create roles with
 * the BYPASSRLS attribute`. A permissive policy targeted at this role is
 * equivalent for our purposes and needs no superuser anywhere.
 *
 * Caveat worth stating plainly: because both roles are granted to the same
 * connecting user, a session that has assumed {@link TenantAppRole} can assume
 * this one — `SET ROLE` is checked against the session user. Row-level security
 * is a tenant-isolation control here, not a sandbox against SQL injection.
 */
export const TenantSystemRole = 'nrb_system';

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
  notification: ['notification_broadcasts', 'notification_segments'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Tables with a nullable `tenant_id`, i.e. a shared tier every tenant may read.
 *
 * `notification_templates` is the case that forced this distinction into
 * existence: its own CHECK constraint requires `tenant_id is null` for every
 * `source = 'code'` row, so the strict predicate — which evaluates to NULL, not
 * false — hid every built-in template from every tenant and refused to insert
 * one. That is a schema-level fact the policy has to model, not a bug to fix by
 * backfilling a sentinel.
 */
export const TenantSharedTierTablesByDomain = {
  notification: ['notification_templates'],
} as const satisfies Record<string, readonly string[]>;

/** Every strictly tenant-scoped table, for tests that assert complete coverage. */
export const TenantScopedTables = Object.values(TenantScopedTablesByDomain).flat();

/** Every shared-tier table, for tests that assert complete coverage. */
export const TenantSharedTierTables = Object.values(TenantSharedTierTablesByDomain).flat();

/**
 * The tenant registry itself, whose own `id` IS the tenant — it carries no
 * `tenant_id` column, so it needs a policy keyed on the primary key instead.
 *
 * Without this, any tenant could read the whole registry. Listing a user's
 * tenants legitimately spans tenants and therefore runs as {@link TenantSystemRole}.
 */
export const TenantRegistryTable = 'auth_tenants';

const isolationPredicate = (column: string): string =>
  `"${column}" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid`;

/**
 * Grants and policies shared by every policied table.
 *
 * Both policies are targeted `TO` a role rather than left untargeted. An
 * untargeted policy also applies to the table owner under `FORCE ROW LEVEL
 * SECURITY`, which would make the migrator's own data backfills match zero rows.
 */
const enablePolicySql = (table: string, using: string, check: string): string[] => [
  `grant select, insert, update, delete on "${table}" to "${TenantAppRole}";`,
  `grant select, insert, update, delete on "${table}" to "${TenantSystemRole}";`,
  `alter table "${table}" enable row level security;`,
  // Without FORCE, the table owner bypasses its own policies — the usual reason
  // an RLS setup passes review and protects nothing.
  `alter table "${table}" force row level security;`,
  `drop policy if exists "${table}_tenant_isolation" on "${table}";`,
  `create policy "${table}_tenant_isolation" on "${table}" to "${TenantAppRole}" ` +
    `using (${using}) with check (${check});`,
  `drop policy if exists "${table}_tenant_system" on "${table}";`,
  `create policy "${table}_tenant_system" on "${table}" to "${TenantSystemRole}" using (true) with check (true);`,
];

/**
 * SQL that puts one table under fail-closed tenant row-level security.
 *
 * The predicate is `nullif(current_setting(...), '')::uuid`, which is NULL when no
 * tenant is set — and `tenant_id = NULL` matches nothing, so absence of a tenant
 * yields no rows rather than every row.
 */
export function tenantRowLevelSecurityUpSql(table: string): string[] {
  const predicate = isolationPredicate('tenant_id');
  return enablePolicySql(table, predicate, predicate);
}

/**
 * SQL for a table whose `tenant_id` is nullable, where NULL means "shared".
 *
 * Reads see the tenant's own rows plus the shared tier; writes are still
 * confined to the caller's own tenant, so a tenant cannot publish a row into
 * every other tenant's view. Shared rows are written as {@link TenantSystemRole}.
 */
export function tenantSharedTierRowLevelSecurityUpSql(table: string): string[] {
  const predicate = isolationPredicate('tenant_id');
  return enablePolicySql(table, `${predicate} or "tenant_id" is null`, predicate);
}

/** Reverses either up path for one table. */
export function tenantRowLevelSecurityDownSql(table: string): string[] {
  return [
    `drop policy if exists "${table}_tenant_isolation" on "${table}";`,
    `drop policy if exists "${table}_tenant_system" on "${table}";`,
    `alter table "${table}" no force row level security;`,
    `alter table "${table}" disable row level security;`,
    `revoke all on "${table}" from "${TenantAppRole}";`,
    `revoke all on "${table}" from "${TenantSystemRole}";`,
  ];
}

/** Fail-closed policy for {@link TenantRegistryTable}, keyed on `id`. */
export function tenantRegistryRowLevelSecurityUpSql(): string[] {
  const predicate = isolationPredicate('id');
  return enablePolicySql(TenantRegistryTable, predicate, predicate);
}

/** Reverses {@link tenantRegistryRowLevelSecurityUpSql}. */
export function tenantRegistryRowLevelSecurityDownSql(): string[] {
  return tenantRowLevelSecurityDownSql(TenantRegistryTable);
}

/**
 * Membership grant for one role.
 *
 * `SET LOCAL ROLE` is denied without it, which is the single defect that made
 * the whole seam untestable in production while every test passed: the
 * component spec issued this grant itself. PostgreSQL 16 also split membership
 * into INHERIT/SET/ADMIN options, and the grant a CREATEROLE creator receives
 * implicitly carries `set_option = false`, so membership existing is not enough.
 *
 * `INHERIT FALSE` is the load-bearing half, and it is easy to get wrong: a
 * policy targeted `TO <role>` applies to anyone who is a MEMBER of that role,
 * not only to a session that has assumed it. Granting membership the default
 * way therefore hands the connecting user the system role's `using (true)`
 * policy permanently, and it reads every tenant's rows without ever calling
 * `SET ROLE` — verified against PostgreSQL 17.6, where the owner saw 2 of 2
 * rows with `WITH SET TRUE` and 0 with `WITH INHERIT FALSE, SET TRUE`.
 *
 * Per-grant inheritance does not exist before PostgreSQL 16, and there is no
 * safe way to emulate it, so the capability refuses to install rather than
 * silently degrade into a cross-tenant read.
 */
const roleMembershipSql = (role: string): string => `do $$ begin
         if current_setting('server_version_num')::int < 160000 then
           raise exception 'tenant isolation requires PostgreSQL 16 or newer: membership must be granted WITH INHERIT FALSE, or the connecting role inherits the tenant policies and reads every tenant';
         end if;
         execute format('grant %I to %I with inherit false, set true', '${role}', current_user);
       end $$;`;

/**
 * Privileges for one role.
 *
 * Schema-wide rather than per-policied-table. `SET LOCAL ROLE` governs the whole
 * transaction, so a request that joins a table without a `tenant_id` —
 * `auth_permissions` and `auth_role_permissions` are the ones RBAC resolution
 * needs — fails with `permission denied for table` unless the role can read it
 * too. The `alter default privileges` pair covers tables a later migration
 * creates; without it every future table is unreachable by the restricted role.
 */
const rolePrivilegesSql = (role: string): string[] => [
  `grant usage on schema public to "${role}";`,
  `grant select, insert, update, delete on all tables in schema public to "${role}";`,
  `grant usage, select on all sequences in schema public to "${role}";`,
  `alter default privileges in schema public grant select, insert, update, delete on tables to "${role}";`,
  `alter default privileges in schema public grant usage, select on sequences to "${role}";`,
];

/**
 * SQL creating the two roles. Idempotent, and safe to emit from more than one
 * domain's migration since each runs independently.
 */
export function tenantAppRoleUpSql(): string[] {
  return [TenantAppRole, TenantSystemRole].flatMap((role) => [
    `do $$ begin
         if not exists (select 1 from pg_roles where rolname = '${role}') then
           create role "${role}" nologin nobypassrls;
         end if;
       end $$;`,
    roleMembershipSql(role),
    ...rolePrivilegesSql(role),
  ]);
}
