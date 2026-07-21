import { AdminAuthLoginAnalyticsReadPermission } from '@app/common-authz';
import { describe, expect, it } from 'vitest';
import { Migration20260721200000CreateAuthLoginAnalytics } from './Migration20260721200000CreateAuthLoginAnalytics';
import { Migration20260721201000GrantAuthLoginAnalyticsRead } from './Migration20260721201000GrantAuthLoginAnalyticsRead';
import { authMigrations } from './index';

const collectSql = (migration: { addSql(sql: string): void }, run: () => void): string => {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
};

describe('Grant auth login analytics read migration', () => {
  it('upserts the catalog permission and grants every admin role idempotently', () => {
    const migration = new Migration20260721201000GrantAuthLoginAnalyticsRead(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('insert into "auth_permissions"');
    expect(sql).toContain(AdminAuthLoginAnalyticsReadPermission);
    expect(sql).toContain('on conflict ("key") do update');
    expect(sql).toContain('insert into "auth_role_permissions"');
    expect(sql).toContain('on conflict do nothing');
  });

  it('removes the owned role grants and permission on rollback', () => {
    const migration = new Migration20260721201000GrantAuthLoginAnalyticsRead(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('delete from "auth_role_permissions"');
    expect(sql).toContain('delete from "auth_permissions"');
    expect(sql).toContain(AdminAuthLoginAnalyticsReadPermission);
  });

  it('runs after the analytics data model migration', () => {
    expect(authMigrations.indexOf(Migration20260721200000CreateAuthLoginAnalytics)).toBeLessThan(
      authMigrations.indexOf(Migration20260721201000GrantAuthLoginAnalyticsRead),
    );
  });
});
