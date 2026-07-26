// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { Migration20260722090000DropLegacyRefreshTokens } from './Migration20260722090000DropLegacyRefreshTokens';
import { Migration20260722091000DropLegacyAuthUserAccessCache } from './Migration20260722091000DropLegacyAuthUserAccessCache';
import { authMigrations } from './index';

function collectSql(direction: 'up' | 'down'): string {
  const migration = new Migration20260722091000DropLegacyAuthUserAccessCache(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration[direction]();
  return statements.join('\n');
}

describe('legacy auth-user access-cache removal migration', () => {
  it('drops both denormalized authorization columns', () => {
    const sql = collectSql('up');
    expect(sql).toContain('drop column if exists "roles"');
    expect(sql).toContain('drop column if exists "permissions"');
  });

  it('restores the historical columns only for rollback', () => {
    const sql = collectSql('down');
    expect(sql).toContain('add column if not exists "roles" jsonb');
    expect(sql).toContain('add column if not exists "permissions" jsonb');
  });

  it('runs after the refresh-token cleanup migration', () => {
    expect(authMigrations.indexOf(Migration20260722090000DropLegacyRefreshTokens)).toBeLessThan(
      authMigrations.indexOf(Migration20260722091000DropLegacyAuthUserAccessCache),
    );
  });
});
