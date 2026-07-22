import { describe, expect, it } from 'vitest';
import { authMigrations } from './index';
import { Migration20260722091000DropLegacyAuthUserAccessCache } from './Migration20260722091000DropLegacyAuthUserAccessCache';
import { Migration20260722092000CreateCanonicalSessions } from './Migration20260722092000CreateCanonicalSessions';

function sqlFor(direction: 'up' | 'down'): string {
  const migration = new Migration20260722092000CreateCanonicalSessions(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration[direction]();
  return statements.join('\n');
}

describe('canonical server-side session migration', () => {
  it('creates the shared session table and expiry index', () => {
    const sql = sqlFor('up');
    expect(sql).toContain('create table if not exists "fastify_sessions"');
    expect(sql).toContain('"sess" jsonb not null');
    expect(sql).toContain('"expire" timestamptz not null');
    expect(sql).toContain('ix__fastify_sessions__expire');
  });

  it('supports rollback and follows legacy access-cache cleanup', () => {
    expect(sqlFor('down')).toContain('drop table if exists "fastify_sessions"');
    expect(authMigrations.indexOf(Migration20260722092000CreateCanonicalSessions)).toBe(
      authMigrations.indexOf(Migration20260722091000DropLegacyAuthUserAccessCache) + 1,
    );
  });
});
