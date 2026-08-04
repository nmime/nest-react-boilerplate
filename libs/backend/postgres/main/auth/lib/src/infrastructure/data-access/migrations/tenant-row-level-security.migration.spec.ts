// @requirements REQ-AUTH-TENANT-ISOLATION-010
import {
  TenantAppRole,
  TenantContextGuc,
  TenantScopedTablesByDomain,
  TenantSystemRole,
} from '@app/backend-common-tenant-policy';
import { describe, expect, it } from 'vitest';
import { Migration20260803120000TenantRowLevelSecurity } from './Migration20260803120000TenantRowLevelSecurity';
import { authMigrations, authTenancyMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  run();

  return statements.join('\n');
}

const upSql = (): string => {
  const migration = new Migration20260803120000TenantRowLevelSecurity(undefined as never, undefined as never);
  return collectSql(migration, () => {
    migration.up();
  });
};

const downSql = (): string => {
  const migration = new Migration20260803120000TenantRowLevelSecurity(undefined as never, undefined as never);
  return collectSql(migration, () => {
    migration.down();
  });
};

describe('tenant row-level-security migration', () => {
  it('is owned by the tenancy capability, not the base auth set', () => {
    // The base set must not carry it. Row-level security is DDL that runs
    // against every project's database, and a single-tenant project has no
    // runtime able to satisfy the policies — it would read zero rows.
    expect(authMigrations.map((entry) => entry.name)).not.toContain('Migration20260803120000TenantRowLevelSecurity');
    expect(authTenancyMigrations.map((entry) => entry.name)).toContain('Migration20260803120000TenantRowLevelSecurity');
  });

  it('creates the restricted role without bypass rights', () => {
    // A BYPASSRLS role silently disables every policy while leaving them in place,
    // which is the usual way an RLS setup protects nothing.
    const sql = upSql();

    expect(sql).toContain(`create role "${TenantAppRole}" nologin nobypassrls`);
    expect(sql).not.toMatch(/create role[^;]*\bbypassrls\b(?!\s*;)/iu);
  });

  it.each(TenantScopedTablesByDomain.auth)('protects %s with force-enabled policies and grants', (table) => {
    // Every tenant-scoped table must appear. One missing table has no policy and
    // leaks across tenants, so this is asserted per table rather than in bulk.
    const sql = upSql();

    expect(sql).toContain(`alter table "${table}" enable row level security;`);
    expect(sql).toContain(`alter table "${table}" force row level security;`);
    expect(sql).toContain(`grant select, insert, update, delete on "${table}" to "${TenantAppRole}";`);
    expect(sql).toContain(
      `create policy "${table}_tenant_isolation" on "${table}" to "${TenantAppRole}" ` +
        `using ("tenant_id" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid) ` +
        `with check ("tenant_id" = nullif(current_setting('${TenantContextGuc}', true), '')::uuid);`,
    );
    // Targeted at the role, never left untargeted: an untargeted policy also
    // binds the table owner, so the migrator's own data backfills would match
    // zero rows.
    expect(sql).toContain(
      `create policy "${table}_tenant_system" on "${table}" to "${TenantSystemRole}" using (true) with check (true);`,
    );
  });

  it('grants membership without inheritance, so the connecting role reads nothing by default', () => {
    // A policy targeted `TO <role>` binds every MEMBER of that role. Without
    // `inherit false` the application's own connection picks up the system
    // role's `using (true)` policy and sees every tenant with no SET ROLE.
    const sql = upSql();

    for (const role of [TenantAppRole, TenantSystemRole]) {
      expect(sql).toContain(`execute format('grant %I to %I with inherit false, set true', '${role}', current_user)`);
    }
  });

  it('writes a fail-closed predicate rather than a permissive fallback', () => {
    const sql = upSql();

    // `nullif(..., '')::uuid` is NULL with no tenant set, and `tenant_id = NULL`
    // matches nothing. A `coalesce` to a real id, or an `or ... is null` escape,
    // would turn the absence of a tenant into full visibility. The auth domain
    // has no shared tier, so the escape must not appear here at all.
    expect(sql).not.toMatch(/coalesce\s*\(\s*current_setting/iu);
    expect(sql).not.toMatch(/or\s+"tenant_id"\s+is\s+null/iu);
  });

  it('is idempotent for a database that already has the role', () => {
    expect(upSql()).toContain(`if not exists (select 1 from pg_roles where rolname = '${TenantAppRole}')`);
  });

  it.each(TenantScopedTablesByDomain.auth)('reverses %s cleanly', (table) => {
    const sql = downSql();

    expect(sql).toContain(`drop policy if exists "${table}_tenant_isolation" on "${table}";`);
    expect(sql).toContain(`alter table "${table}" no force row level security;`);
    expect(sql).toContain(`alter table "${table}" disable row level security;`);
  });

  it('leaves the role in place on the way down', () => {
    // Other databases in the cluster may still grant it, and dropping a role that
    // owns grants elsewhere fails.
    expect(downSql()).not.toContain(`drop role`);
  });
});
