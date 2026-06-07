import { describe, expect, it } from "vitest";
import { Migration20260607080000AlignAuthUserLocaleConstraint } from "./Migration20260607080000AlignAuthUserLocaleConstraint";
import { authMigrations } from "./index";

function collectSql(migration: { addSql(sql: string): void; up(): void }) {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  migration.up();

  return statements.join("\n");
}

describe("auth locale schema migration", () => {
  it("replaces stale auth user locale constraints with en/ru", () => {
    const sql = collectSql(
      new Migration20260607080000AlignAuthUserLocaleConstraint(),
    );

    expect(sql).toContain(
      'drop constraint if exists "auth_users_locale_check"',
    );
    expect(sql).toContain('drop constraint if exists "ck__auth_users__locale"');
    expect(sql).toContain('add constraint "ck__auth_users__locale"');
    expect(sql).toContain(`check ("locale" in ('en', 'ru'))`);
  });

  it("registers after the outbox migration on current main", () => {
    expect(authMigrations.at(-1)).toBe(
      Migration20260607080000AlignAuthUserLocaleConstraint,
    );
  });
});
