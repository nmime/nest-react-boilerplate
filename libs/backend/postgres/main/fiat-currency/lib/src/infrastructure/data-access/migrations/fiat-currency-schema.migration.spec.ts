// @requirements REQ-FIAT-HISTORY-003
import { describe, expect, it } from 'vitest';
import { Migration20260812090000CreateFiatCurrencies } from './Migration20260812090000CreateFiatCurrencies';
import { fiatCurrencyMigrationOptions, fiatCurrencyMigrations } from './index';

const renderUp = (): string => {
  const migration = new Migration20260812090000CreateFiatCurrencies(undefined as never, undefined as never);
  const sql: string[] = [];
  migration.addSql = (query: string) => {
    sql.push(query);
  };

  migration.up();

  return sql.join('\n');
};

const rendersDdl: Array<[behaviour: string, fragments: string[]]> = [
  [
    'creates the catalogue keyed by currency code',
    [
      'create table "fiat_currencies"',
      'constraint "pk__fiat_currencies" primary key ("code")',
      'constraint "ck__fiat_currencies__code"',
    ],
  ],
  [
    'carries the localized name and symbol on the row itself',
    ['"name" jsonb not null', '"symbol" jsonb not null', 'constraint "ck__fiat_currencies__name"'],
  ],
  [
    'keeps rate history append-only and idempotent per source and instant',
    [
      'create table "fiat_currency_rates"',
      'constraint "uq__fiat_currency_rates__code_as_of_source"',
      'create index "ix__fiat_currency_rates__code_as_of_desc"',
    ],
  ],
];

describe('fiat currency migrations', () => {
  it.each(rendersDdl)('%s', (_behaviour, fragments) => {
    const sql = renderUp();

    for (const fragment of fragments) {
      expect(sql).toContain(fragment);
    }
  });

  it('holds the USD rate at a scale the exact arithmetic can consume', () => {
    const sql = renderUp();

    expect(sql).toContain('"usd_per_unit" numeric(15,10)');
    expect(sql).toContain('constraint "ck__fiat_currencies__usd_per_unit"');
  });

  it('refuses a rate without the instant it was true', () => {
    expect(renderUp()).toContain('constraint "ck__fiat_currencies__rate_pairing"');
  });

  it('has no second table for names to fall out of step with', () => {
    // A row per locale meant a join on the hot list path and an insert order the unit of work had
    // no dependency to derive. One jsonb value is written and read with the currency it describes.
    expect(renderUp()).not.toContain('fiat_currency_translations');
  });

  it('refuses a currency whose name is not a json object', () => {
    // jsonb accepts `"Euro"`, `42` and `null` as valid documents. Only an object is a locale map,
    // and the check is the only thing standing between a typo in an admin payload and a list
    // endpoint that throws on every read.
    expect(renderUp()).toContain(`jsonb_typeof("name") = 'object'`);
  });

  it('drops the history before the catalogue it references', () => {
    const migration = new Migration20260812090000CreateFiatCurrencies(undefined as never, undefined as never);
    const sql: string[] = [];
    migration.addSql = (query: string) => {
      sql.push(query);
    };

    migration.down();

    expect(sql.join('\n')).toContain('drop table if exists "fiat_currency_rates"');
    expect(sql.findIndex((query) => query.includes('"fiat_currencies"'))).toBe(sql.length - 1);
  });

  it('keeps every constraint name inside the Postgres identifier limit', () => {
    const names = [...renderUp().matchAll(/"((?:pk|uq|ix|ck|fk)__[a-z_]+)"/gu)].map(([, name]) => name ?? '');

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => Buffer.byteLength(name) > 63)).toEqual([]);
  });

  it('registers the migration for tooling', () => {
    expect(fiatCurrencyMigrations).toEqual([Migration20260812090000CreateFiatCurrencies]);
    expect(fiatCurrencyMigrationOptions.migrationsList).toEqual([Migration20260812090000CreateFiatCurrencies]);
  });
});
