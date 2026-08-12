// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { Migration20260812120000AddAuthUserAccountRecovery } from './Migration20260812120000AddAuthUserAccountRecovery';
import { Migration20260722091000DropLegacyAuthUserAccessCache } from './Migration20260722091000DropLegacyAuthUserAccessCache';
import { authMigrations } from './index';

function collectSql(direction: 'up' | 'down'): string {
  const migration = new Migration20260812120000AddAuthUserAccountRecovery(undefined as never, undefined as never);
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  migration[direction]();
  return statements.join('\n');
}

describe('auth account recovery migration', () => {
  it('adds the verification timestamp and the credential epoch', () => {
    const sql = collectSql('up');

    expect(sql).toContain(
      `add column if not exists "email_verified_at" timestamptz not null default 'epoch'::timestamptz`,
    );
    expect(sql).toContain('add column if not exists "credential_revision" int not null default 0');
  });

  it('records "never verified" as the epoch rather than as a missing value', () => {
    // Every timestamp on auth_users is NOT NULL with a sentinel default, so a half-written row is
    // impossible to represent. The entity trades the epoch back for null at the boundary.
    expect(collectSql('up')).not.toMatch(/"email_verified_at"\s+timestamptz\s+null/u);
  });

  it('defaults the epoch for rows that predate it so live sessions survive the deploy', () => {
    // A backfill to anything but zero would 401 every signed-in user the moment this ships.
    expect(collectSql('up')).toContain('default 0');
    expect(collectSql('up')).not.toMatch(/update "auth_users"\s+set "credential_revision"/u);
  });

  it('drops both columns on rollback', () => {
    const sql = collectSql('down');

    expect(sql).toContain('drop column if exists "credential_revision"');
    expect(sql).toContain('drop column if exists "email_verified_at"');
  });

  it('runs after the access-cache cleanup that last reshaped auth_users', () => {
    expect(authMigrations).toContain(Migration20260812120000AddAuthUserAccountRecovery);
    expect(authMigrations.indexOf(Migration20260722091000DropLegacyAuthUserAccessCache)).toBeLessThan(
      authMigrations.indexOf(Migration20260812120000AddAuthUserAccountRecovery),
    );
  });
});
