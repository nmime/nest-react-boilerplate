// @requirements REQ-API-RESPONSE-STUDIO-003
// @requirements REQ-API-RESPONSE-STUDIO-004
import { describe, expect, it } from 'vitest';
import { Migration20260812120000AddAuthUserAccountRecovery } from './Migration20260812120000AddAuthUserAccountRecovery';
import { Migration20260828110000CreateApiResponseStudio } from './Migration20260828110000CreateApiResponseStudio';
import { authMigrations } from './index';

const collectSql = (migration: { addSql(sql: string): void }, run: () => void): string => {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
};

describe('API Response Studio PostgreSQL migration', () => {
  it('creates tenant-scoped tables, constraints and deterministic query indexes', () => {
    const migration = new Migration20260828110000CreateApiResponseStudio(undefined as never, undefined as never);
    const sql = collectSql(migration, () => migration.up());

    expect(sql).toContain('create table "api_response_studio_sources"');
    expect(sql).toContain('unique ("tenant_id","slug")');
    expect(sql).toContain('create table "api_response_studio_responses"');
    expect(sql).toContain('unique ("tenant_id","source_id","stable_key")');
    expect(sql).toContain("check (\"display\" in ('toast','modal','custom','silent'))");
    expect(sql).toContain("check (\"severity\" in ('error','warning','info','success'))");
    expect(sql).toContain('ix__api_response_studio_sources__tenant_enabled');
    expect(sql).toContain('ix__api_response_studio_responses__tenant_source_path');
    expect(sql).toContain('ix__api_response_studio_responses__tenant_change');
    expect(sql).toContain('ix__api_response_studio_responses__tenant_deleted');
    expect(sql).toContain('ix__api_response_studio_history__tenant_created');
    expect(sql).toContain('ix__api_response_studio_history__tenant_source_created');
    expect(sql).toContain('ix__api_response_studio_history__tenant_response_created');
  });

  it('backfills EN and RU independently and preserves already-populated presentation arrays', () => {
    const migration = new Migration20260828110000CreateApiResponseStudio(undefined as never, undefined as never);
    const sql = collectSql(migration, () => migration.up());
    const updates = sql
      .split('\n')
      .filter((statement) => statement.startsWith('update "problem_presentation_overrides"'));

    expect(updates).toHaveLength(2);
    expect(updates[0]).toContain('where "texts_en" = \'[]\'::jsonb');
    expect(updates[0]).not.toContain('"texts_ru" = \'[]\'::jsonb');
    expect(updates[1]).toContain('where "texts_ru" = \'[]\'::jsonb');
    expect(updates[1]).not.toContain('"texts_en" = \'[]\'::jsonb');
    expect(sql).toContain('add column if not exists "message_zh"');
    expect(sql).toContain('add column if not exists "texts_en"');
    expect(sql).not.toContain('drop column "message_en"');
    expect(sql).not.toContain('drop column "message_ru"');
  });

  it('is last in the catalog and has an explicit rollback for only its additive schema', () => {
    const migration = new Migration20260828110000CreateApiResponseStudio(undefined as never, undefined as never);
    const down = collectSql(migration, () => migration.down());

    expect(authMigrations.indexOf(Migration20260812120000AddAuthUserAccountRecovery)).toBeLessThan(
      authMigrations.indexOf(Migration20260828110000CreateApiResponseStudio),
    );
    expect(authMigrations.at(-1)).toBe(Migration20260828110000CreateApiResponseStudio);
    expect(down).toContain('drop table if exists "api_response_studio_history" cascade');
    expect(down).toContain("check (\"display\" in ('toast','silent'))");
  });
});
