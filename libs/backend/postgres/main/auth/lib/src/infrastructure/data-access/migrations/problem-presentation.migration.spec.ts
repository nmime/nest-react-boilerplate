// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { Migration20260716120000AddTelegramOidcChannel } from './Migration20260716120000AddTelegramOidcChannel';
import { Migration20260719120000CreateProblemPresentationOverrides } from './Migration20260719120000CreateProblemPresentationOverrides';
import { authMigrations } from './index';

const collectSql = (migration: { addSql(sql: string): void }, run: () => void): string => {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  run();
  return statements.join('\n');
};

describe('problem presentation migration', () => {
  it('creates tenant-scoped, audited, revisioned overrides with constrained values', () => {
    const migration = new Migration20260719120000CreateProblemPresentationOverrides(
      undefined as never,
      undefined as never,
    );
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('create table "problem_presentation_overrides"');
    expect(sql).toContain('unique ("tenant_id", "rule_id")');
    expect(sql).toContain('"message_en" text not null default \'\'');
    expect(sql).toContain('"message_ru" text not null default \'\'');
    expect(sql).toContain('references "auth_tenants" ("id")');
    expect(sql).toContain('references "auth_users" ("id")');
    expect(sql).toContain("check (\"display\" in ('toast', 'silent'))");
    expect(sql).toContain("check (\"severity\" in ('error', 'warning', 'info', 'success'))");
    expect(sql).toContain('check ("revision" >= 1)');
    expect(sql).toContain('ix__problem_presentation_overrides__tenant_id');
  });

  it('drops the override table on rollback and remains last in the ordered catalog', () => {
    const migration = new Migration20260719120000CreateProblemPresentationOverrides(
      undefined as never,
      undefined as never,
    );
    expect(
      collectSql(migration, () => {
        migration.down();
      }),
    ).toContain('drop table if exists "problem_presentation_overrides" cascade');
    expect(authMigrations.indexOf(Migration20260716120000AddTelegramOidcChannel)).toBeLessThan(
      authMigrations.indexOf(Migration20260719120000CreateProblemPresentationOverrides),
    );
  });
});
