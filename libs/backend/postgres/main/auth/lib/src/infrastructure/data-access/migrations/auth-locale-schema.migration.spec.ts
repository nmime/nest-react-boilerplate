// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { supportedLocales } from '@app/backend-common-i18n';
import { Migration20260607080000AlignAuthUserLocaleConstraint } from './Migration20260607080000AlignAuthUserLocaleConstraint';
import { Migration20260609100000CreateFeatureFlags } from '@app/backend-postgres-main-feature-flags';
import { checkConstraintSql } from '../check-constraint';
import { authMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void; up(): void }) {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  migration.up();

  return statements.join('\n');
}

describe('auth locale schema migration', () => {
  it('replaces stale auth user locale constraints with the supported locales', () => {
    const sql = collectSql(
      new Migration20260607080000AlignAuthUserLocaleConstraint(undefined as never, undefined as never),
    );

    expect(sql).toContain('drop constraint if exists "auth_users_locale_check"');
    expect(sql).toContain('drop constraint if exists "ck__auth_users__locale"');
    expect(sql).toContain('add constraint "ck__auth_users__locale"');
    // Derived, not restated: a product that widens `supportedLocales` writes its own migration
    // and this file stops being something it has to edit. `check-constraint.spec.ts` is what
    // holds the whole chain to the tuple; this only pins what THIS migration does.
    expect(sql).toContain(`check (${checkConstraintSql('locale', supportedLocales)})`);
  });

  it('keeps the locale migration before later feature flag migrations', () => {
    expect(authMigrations).toContain(Migration20260607080000AlignAuthUserLocaleConstraint);
    expect(authMigrations.indexOf(Migration20260607080000AlignAuthUserLocaleConstraint)).toBeLessThan(
      authMigrations.indexOf(Migration20260609100000CreateFeatureFlags),
    );
  });
});
