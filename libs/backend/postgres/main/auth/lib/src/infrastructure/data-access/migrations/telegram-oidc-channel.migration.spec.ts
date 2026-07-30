// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { Migration20260710120000AddAuthUserAvatar } from './Migration20260710120000AddAuthUserAvatar';
import { Migration20260716120000AddTelegramOidcChannel } from './Migration20260716120000AddTelegramOidcChannel';
import { authMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
}

describe('Telegram OIDC auth-channel migration', () => {
  it('adds telegram_oidc to external identities and auth methods', () => {
    const migration = new Migration20260716120000AddTelegramOidcChannel(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('ck__auth_external_identities__channel');
    expect(sql).toContain('ck__auth_methods__method');
    expect(sql).toContain(`set "channel" = 'telegram_oidc' where "channel" = 'telegram_web_login'`);
    expect(sql).toContain(`set "method" = 'telegram_oidc' where "method" = 'telegram_web_login'`);
  });

  it('restores both previous constraints on rollback', () => {
    const migration = new Migration20260716120000AddTelegramOidcChannel(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('ck__auth_external_identities__channel');
    expect(sql).toContain('ck__auth_methods__method');
    expect(sql).toContain(`set "channel" = 'telegram_web_login' where "channel" = 'telegram_oidc'`);
    expect(sql).toContain(`set "method" = 'telegram_web_login' where "method" = 'telegram_oidc'`);
  });

  it('runs after the latest existing auth migration', () => {
    expect(authMigrations.indexOf(Migration20260710120000AddAuthUserAvatar)).toBeLessThan(
      authMigrations.indexOf(Migration20260716120000AddTelegramOidcChannel),
    );
  });
});
