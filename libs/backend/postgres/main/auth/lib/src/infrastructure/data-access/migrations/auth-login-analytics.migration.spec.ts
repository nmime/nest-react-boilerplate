import { describe, expect, it } from 'vitest';
import { Migration20260721170000AddAdminAuditFilterIndexes } from './Migration20260721170000AddAdminAuditFilterIndexes';
import { Migration20260721200000CreateAuthLoginAnalytics } from './Migration20260721200000CreateAuthLoginAnalytics';
import { authMigrations } from './index';

const sqlFor = (direction: 'up' | 'down'): string => {
  const migration = new Migration20260721200000CreateAuthLoginAnalytics(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration[direction]();
  return statements.join('\n');
};

describe('auth login analytics migration', () => {
  it('creates tenant-scoped append-only event storage and aggregate indexes', () => {
    const sql = sqlFor('up');
    expect(sql).toContain('create table "auth_login_events"');
    expect(sql).toContain('"network_anonymized_at" timestamptz null');
    expect(sql).toContain('ix__auth_login_events__tenant_id_country_code_occurred_at');
  });

  it('is reversible and ordered after the audit filter migration', () => {
    expect(sqlFor('down')).toContain('drop table if exists "auth_login_events" cascade');
    expect(authMigrations.indexOf(Migration20260721170000AddAdminAuditFilterIndexes)).toBeLessThan(
      authMigrations.indexOf(Migration20260721200000CreateAuthLoginAnalytics),
    );
  });
});
