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

describe('fiat currency migrations', () => {
  it('creates the catalogue keyed by currency code', () => {
    const sql = renderUp();

    expect(sql).toContain('create table "fiat_currencies"');
    expect(sql).toContain('constraint "pk__fiat_currencies" primary key ("code")');
    expect(sql).toContain('constraint "ck__fiat_currencies__code"');
  });

  it('holds the USD rate at a scale the exact arithmetic can consume', () => {
    const sql = renderUp();

    expect(sql).toContain('"usd_per_unit" numeric(15,10)');
    expect(sql).toContain('constraint "ck__fiat_currencies__usd_per_unit"');
  });

  it('refuses a rate without the instant it was true', () => {
    expect(renderUp()).toContain('constraint "ck__fiat_currencies__rate_pairing"');
  });

  it('stores localized names in their own table keyed by currency and locale', () => {
    const sql = renderUp();

    expect(sql).toContain('create table "fiat_currency_translations"');
    expect(sql).toContain('constraint "pk__fiat_currency_translations" primary key ("code", "locale")');
    expect(sql).toContain('constraint "fk__fiat_currency_translations__code"');
  });

  it('keeps rate history append-only and idempotent per source and instant', () => {
    const sql = renderUp();

    expect(sql).toContain('create table "fiat_currency_rates"');
    expect(sql).toContain('constraint "uq__fiat_currency_rates__code_as_of_source"');
    expect(sql).toContain('create index "ix__fiat_currency_rates__code_as_of_desc"');
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
