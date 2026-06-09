import { describe, expect, it } from "vitest";
import { Migration20260607080000AlignAuthUserLocaleConstraint } from "./Migration20260607080000AlignAuthUserLocaleConstraint";
import { Migration20260609100000CreateFeatureFlags } from "@app/postgres-main-feature-flags";
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

  it("keeps the locale migration before later feature flag migrations", () => {
    expect(authMigrations).toContain(
      Migration20260607080000AlignAuthUserLocaleConstraint,
    );
    expect(authMigrations.at(-1)).toBe(
      Migration20260609100000CreateFeatureFlags,
    );
    expect(
      authMigrations.indexOf(
        Migration20260607080000AlignAuthUserLocaleConstraint,
      ),
    ).toBeLessThan(
      authMigrations.indexOf(Migration20260609100000CreateFeatureFlags),
    );
  });
});
