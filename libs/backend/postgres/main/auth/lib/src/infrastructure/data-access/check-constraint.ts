import { supportedLocales } from '@app/backend-common-i18n';

/**
 * A CHECK constraint whose admitted values are derived from a TypeScript tuple.
 *
 * The entity renders its expression from the tuple, so widening the tuple changes what the schema
 * *should* allow — but the constraint that actually exists in a deployed database was created by a
 * hand-written migration, and DDL cannot be regenerated safely. Nothing connected the two: adding
 * a locale passed typecheck, the catalog gate and `nrb db migrations-check` (all lexical), the
 * request path accepted the new value because the DTOs derive from the same tuple, and Postgres
 * rejected the write with a 23514 at runtime.
 *
 * Declaring the pair makes the gap checkable. A product enrols its own tuple-backed constraint by
 * exporting one of these and asserting {@link checkConstraintDrift} over its own migration chain.
 */
export interface TupleBackedCheckConstraint {
  /** Constraint name, as it appears in `add constraint "<name>"`. */
  name: string;
  table: string;
  column: string;
  values: readonly string[];
}

/** The single spelling of a tuple-backed check expression, shared by the entity and the migrations. */
export function checkConstraintSql(column: string, values: readonly string[]): string {
  const quoted = values.map((value) => `'${value}'`).join(', ');
  return `"${column}" in (${quoted})`;
}

export const authUserLocaleCheckConstraint: TupleBackedCheckConstraint = {
  name: 'ck__auth_users__locale',
  table: 'auth_users',
  column: 'locale',
  values: supportedLocales,
};

interface MigrationLike {
  addSql(sql: string): void;
  up(): void | Promise<void>;
}

type MigrationChainEntry = new (driver: never, config: never) => MigrationLike;

/**
 * The SQL a migration list applies, in order, without touching a database.
 *
 * Each migration is constructed with a stubbed `addSql` and its `up()` is run for its statements
 * alone, which is what lets a unit test replay the whole chain.
 */
export async function migrationChainSql(migrations: readonly MigrationChainEntry[]): Promise<string> {
  const statements: string[] = [];
  for (const MigrationClass of migrations) {
    const migration = new MigrationClass(undefined as never, undefined as never);
    migration.addSql = (sql: string) => {
      statements.push(sql);
    };
    // The chain is ordered; running the migrations concurrently would scramble the statements.
    // eslint-disable-next-line no-await-in-loop
    await migration.up();
  }

  return statements.join('\n');
}

/**
 * The expression a named CHECK constraint carries once the whole chain has been applied.
 *
 * Later statements win, and a trailing drop leaves no constraint at all, so this is the state a
 * fresh database ends up in — not the state any single migration describes. Conditional adds
 * (`if not exists (select 1 from pg_constraint …)`) are no-ops once the constraint exists, which
 * is exactly what taking the last add models.
 */
export function resolveFinalCheckExpression(sql: string, constraintName: string): string | undefined {
  const pattern = new RegExp(
    String.raw`(add|drop)\s+constraint\s+(?:if\s+exists\s+)?"${escapeRegExp(constraintName)}"`,
    'giu',
  );
  let expression: string | undefined;

  for (const match of sql.matchAll(pattern)) {
    if (match[1]?.toLowerCase() === 'drop') {
      expression = undefined;
      continue;
    }
    expression = readCheckExpression(sql, match.index + match[0].length);
  }

  return expression;
}

/**
 * What a product has to write when its tuple has outgrown its migration chain, or `undefined` when
 * the two already agree.
 */
export function checkConstraintDrift(sql: string, constraint: TupleBackedCheckConstraint): string | undefined {
  const expected = checkConstraintSql(constraint.column, constraint.values);
  const actual = resolveFinalCheckExpression(sql, constraint.name);
  if (actual === expected) {
    return undefined;
  }

  const missing = constraint.values.filter((value) => !actual?.includes(`'${value}'`));
  return [
    `"${constraint.name}" on "${constraint.table}" does not match the tuple it is derived from.`,
    `  migration chain: ${actual ?? '(no constraint)'}`,
    `  tuple:           ${expected}`,
    ...(missing.length > 0 ? [`  not admitted:    ${missing.join(', ')}`] : []),
    'Add a migration whose up() runs:',
    `  alter table "${constraint.table}" drop constraint if exists "${constraint.name}";`,
    `  alter table "${constraint.table}" add constraint "${constraint.name}" check (${expected});`,
    `Its down() must re-map stored "${constraint.column}" values before narrowing the constraint back,`,
    'or the rollback fails on rows already written with a value the older constraint rejects.',
  ].join('\n');
}

function readCheckExpression(sql: string, from: number): string | undefined {
  // One statement at a time: a constraint that carries no CHECK must not pick up the next
  // statement's.
  const terminator = sql.indexOf(';', from);
  const statement = sql.slice(from, terminator === -1 ? sql.length : terminator);
  const check = /check\s*\(/iu.exec(statement);
  if (!check) {
    return undefined;
  }

  const start = check.index + check[0].length;
  let depth = 1;
  let quoted = false;
  for (let index = start; index < statement.length; index += 1) {
    const character = statement[index];
    if (character === `'`) {
      quoted = !quoted;
      continue;
    }
    if (quoted) {
      continue;
    }
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return statement.slice(start, index).replace(/\s+/gu, ' ').trim();
      }
    }
  }

  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}
