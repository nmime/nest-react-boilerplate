import { describe, expect, it } from 'vitest';
import { Migration20260721210000NormalizeRbacAccess } from './Migration20260721210000NormalizeRbacAccess';
import { Migration20260722090000DropLegacyRefreshTokens } from './Migration20260722090000DropLegacyRefreshTokens';
import { authMigrations } from './index';

function sqlFor(direction: 'up' | 'down'): string {
  const migration = new Migration20260722090000DropLegacyRefreshTokens(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration[direction]();
  return statements.join('\n');
}

describe('legacy refresh-token removal migration', () => {
  it('drops the retired first-party refresh-token table', () => {
    expect(sqlFor('up')).toContain('drop table if exists "auth_refresh_tokens"');
  });

  it('recreates the final historical schema for database rollback', () => {
    const sql = sqlFor('down');
    expect(sql).toContain('create table if not exists "auth_refresh_tokens"');
    expect(sql).toContain('"auth_context" jsonb not null');
    expect(sql).toContain('ix__auth_refresh_tokens__expires_at');
  });

  it('runs after normalized RBAC migration', () => {
    expect(authMigrations.indexOf(Migration20260721210000NormalizeRbacAccess)).toBeLessThan(
      authMigrations.indexOf(Migration20260722090000DropLegacyRefreshTokens),
    );
  });
});
