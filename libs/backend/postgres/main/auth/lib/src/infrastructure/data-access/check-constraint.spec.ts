// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { supportedLocales } from '@app/backend-common-i18n';
import {
  authUserLocaleCheckConstraint,
  checkConstraintDrift,
  checkConstraintSql,
  migrationChainSql,
  resolveFinalCheckExpression,
} from './check-constraint';
import { AuthUserEntitySchema } from './entities/auth-user.entity';
import { authMigrations } from './migrations';

const constraintName = 'ck__auth_users__locale';

function fixture(...expressions: readonly (string | null)[]): string {
  return expressions
    .map((expression) =>
      expression === null
        ? `alter table "auth_users" drop constraint if exists "${constraintName}";`
        : `alter table "auth_users" add constraint "${constraintName}" check (${expression});`,
    )
    .join('\n');
}

describe('tuple-backed check constraints', () => {
  it('renders the same SQL a hand-written migration would', () => {
    expect(checkConstraintSql('locale', ['en', 'pt-br'])).toBe(`"locale" in ('en', 'pt-br')`);
  });

  it('takes the last constraint the chain adds, not the first', () => {
    const sql = fixture(`"locale" in ('en', 'es')`, null, `"locale" in ('en', 'ru')`);

    expect(resolveFinalCheckExpression(sql, constraintName)).toBe(`"locale" in ('en', 'ru')`);
  });

  it('reports no constraint when the chain ends by dropping it', () => {
    const sql = fixture(`"locale" in ('en')`, null);

    expect(resolveFinalCheckExpression(sql, constraintName)).toBeUndefined();
  });

  it('names the values a migration still has to admit, and the SQL that admits them', () => {
    const drift = checkConstraintDrift(fixture(`"locale" in ('en')`), {
      name: constraintName,
      table: 'auth_users',
      column: 'locale',
      values: ['en', 'xx'],
    });

    expect(drift).toContain('xx');
    expect(drift).toContain(`check ("locale" in ('en', 'xx'))`);
    // A rollback that narrows the constraint back fails on rows already written with the
    // widened value, so the message has to say so where the product will read it.
    expect(drift).toContain('down');
  });

  it('reports nothing when the chain already admits every value', () => {
    expect(
      checkConstraintDrift(fixture(`"locale" in ('en', 'xx')`), {
        name: constraintName,
        table: 'auth_users',
        column: 'locale',
        values: ['en', 'xx'],
      }),
    ).toBeUndefined();
  });

  it('keeps the shipped auth user locale constraint in step with the supported locales', async () => {
    // Widening `supportedLocales` alone passes typecheck, the catalog gate and migrations-check,
    // and then Postgres rejects the write with a 23514 at runtime. This is where that stops.
    expect(
      checkConstraintDrift(await migrationChainSql(authMigrations), authUserLocaleCheckConstraint),
    ).toBeUndefined();
  });

  it('derives the shipped constraint from the supported locale tuple', () => {
    expect(authUserLocaleCheckConstraint.values).toEqual([...supportedLocales]);
  });

  it('renders the entity constraint through the same renderer the migrations use', () => {
    const check = AuthUserEntitySchema.meta.checks.find(({ name }) => name === authUserLocaleCheckConstraint.name);

    expect(check?.expression).toBe(checkConstraintSql('locale', supportedLocales));
  });
});
