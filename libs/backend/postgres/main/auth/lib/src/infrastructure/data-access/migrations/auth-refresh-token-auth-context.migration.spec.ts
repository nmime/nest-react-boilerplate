import { describe, expect, it } from 'vitest';
import { Migration20260719120000CreateProblemPresentationOverrides } from './Migration20260719120000CreateProblemPresentationOverrides';
import { Migration20260720120000AddAuthRefreshTokenAuthContext } from './Migration20260720120000AddAuthRefreshTokenAuthContext';
import { authMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
}

describe('Auth refresh-token auth-context migration', () => {
  it('adds a nullable jsonb auth_context column to auth_refresh_tokens', () => {
    const migration = new Migration20260720120000AddAuthRefreshTokenAuthContext(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain(
      `alter table "auth_refresh_tokens" add column if not exists "auth_context" jsonb not null default '{}'::jsonb;`,
    );
  });

  it('drops the auth_context column on rollback', () => {
    const migration = new Migration20260720120000AddAuthRefreshTokenAuthContext(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('alter table "auth_refresh_tokens" drop column if exists "auth_context";');
  });

  it('runs after the latest existing auth migration', () => {
    expect(authMigrations.indexOf(Migration20260719120000CreateProblemPresentationOverrides)).toBeLessThan(
      authMigrations.indexOf(Migration20260720120000AddAuthRefreshTokenAuthContext),
    );
  });
});
