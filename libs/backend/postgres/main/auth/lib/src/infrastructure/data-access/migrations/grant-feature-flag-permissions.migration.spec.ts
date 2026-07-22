import { AdminFeatureFlagsReadPermission, AdminFeatureFlagsWritePermission } from '@app/common-authz';
import { describe, expect, it } from 'vitest';
import { Migration20260722092000CreateCanonicalSessions } from './Migration20260722092000CreateCanonicalSessions';
import { Migration20260722100000GrantFeatureFlagPermissions } from './Migration20260722100000GrantFeatureFlagPermissions';
import { authMigrations } from './index';

const collectSql = (migration: { addSql(sql: string): void }, run: () => void): string => {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
};

describe('feature-flag RBAC migration', () => {
  it('upserts both permissions and grants them to every tenant admin idempotently', () => {
    const migration = new Migration20260722100000GrantFeatureFlagPermissions(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain(AdminFeatureFlagsReadPermission);
    expect(sql).toContain(AdminFeatureFlagsWritePermission);
    expect(sql.match(/insert into "auth_permissions"/g)).toHaveLength(2);
    expect(sql.match(/insert into "auth_role_permissions"/g)).toHaveLength(2);
    expect(sql).toContain('on conflict do nothing');
  });

  it('removes the owned grants and permissions on rollback', () => {
    const migration = new Migration20260722100000GrantFeatureFlagPermissions(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('delete from "auth_role_permissions"');
    expect(sql).toContain('delete from "auth_permissions"');
    expect(sql).toContain(AdminFeatureFlagsReadPermission);
    expect(sql).toContain(AdminFeatureFlagsWritePermission);
  });

  it('runs after the canonical session migration', () => {
    expect(authMigrations.indexOf(Migration20260722092000CreateCanonicalSessions)).toBeLessThan(
      authMigrations.indexOf(Migration20260722100000GrantFeatureFlagPermissions),
    );
  });
});
