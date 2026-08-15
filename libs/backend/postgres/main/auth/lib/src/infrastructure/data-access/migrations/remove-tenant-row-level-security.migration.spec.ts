// @requirements REQ-AUTH-TENANT-ISOLATION-010
import { TenantAppRole, TenantScopedTablesByDomain } from '@app/backend-common-tenant-policy';
import { describe, expect, it } from 'vitest';
import { Migration20260804120000RemoveTenantRowLevelSecurity } from './Migration20260804120000RemoveTenantRowLevelSecurity';
import { authMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  run();

  return statements.join('\n');
}

const upSql = (): string => {
  const migration = new Migration20260804120000RemoveTenantRowLevelSecurity(undefined as never, undefined as never);
  return collectSql(migration, () => {
    migration.up();
  });
};

describe('remove tenant row-level-security migration', () => {
  it('is registered in the auth migration set', () => {
    expect(authMigrations.map((entry) => entry.name)).toContain('Migration20260804120000RemoveTenantRowLevelSecurity');
  });

  it('recreates the restricted role idempotently so the reversal is a no-op on fresh databases', () => {
    // Revoke statements reference the role; on a database that never installed
    // the policies the role would not exist, so the reversal re-creates it
    // (NOLOGIN, harmless) instead of failing.
    expect(upSql()).toContain(`if not exists (select 1 from pg_roles where rolname = '${TenantAppRole}')`);
    expect(upSql()).toContain(`create role "${TenantAppRole}" nologin nobypassrls`);
  });

  it.each(TenantScopedTablesByDomain.auth)('reverses the %s policy, RLS state, and grants', (table) => {
    const sql = upSql();

    expect(sql).toContain(`drop policy if exists "${table}_tenant_isolation" on "${table}";`);
    expect(sql).toContain(`alter table "${table}" no force row level security;`);
    expect(sql).toContain(`alter table "${table}" disable row level security;`);
    expect(sql).toContain(`revoke all on "${table}" from "${TenantAppRole}";`);
  });

  it('reverses the tenant registry policy as well', () => {
    const sql = upSql();

    expect(sql).toContain(`drop policy if exists "auth_tenants_tenant_isolation" on "auth_tenants";`);
    expect(sql).toContain(`alter table "auth_tenants" disable row level security;`);
  });

  it('installs no new policies or force-RLS state', () => {
    const sql = upSql();

    expect(sql).not.toContain('create policy');
    expect(sql).not.toContain('enable row level security');
    // Only the `no force row level security;` reversal form may appear.
    expect(sql).not.toMatch(/\balter table "[^"]+" force row level security/u);
  });

  it('does not reinstall policies on rollback so earlier tenant_id drops stay valid', () => {
    const migration = new Migration20260804120000RemoveTenantRowLevelSecurity(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toBe('');
  });
});
