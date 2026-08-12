// @requirements REQ-FIAT-HISTORY-003
import { MikroORM } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { type EntityManager, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import { FiatCurrencyEntitySchema, FiatCurrencyRateEntitySchema } from '../entities';
import { fiatCurrencyMigrationOptions } from '../migrations';
import { FiatCurrencyPostgresPersistence } from './fiat-currency.repository';

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write('Fiat currency component test: skipped because Docker is not available on this host.\n');
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker('fiat currency persistence against PostgreSQL', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver>;

  beforeAll(async () => {
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, [FiatCurrencyEntitySchema, FiatCurrencyRateEntitySchema], {
        extensions: [Migrator],
        migrations: fiatCurrencyMigrationOptions,
      }),
    );
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm.close(true);
    await stopPostgresContainer(container);
  });

  it('keeps the headline rate and the newest history row in agreement across a late arrival', async () => {
    const persistence = repository(orm.em.fork());
    await persistence.upsertCurrency({
      code: 'EUR',
      name: { en: 'Euro', ru: 'Евро' },
      symbol: { default: '€' },
      displayOrder: 1,
    });

    const monday = new Date('2026-08-10T00:00:00.000Z');
    const tuesday = new Date('2026-08-11T00:00:00.000Z');
    await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.0800000000', asOf: tuesday, source: 'ecb' }]);
    await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.0700000000', asOf: monday, source: 'ecb' }]);

    const stored = await persistence.findCurrency('EUR');
    expect(stored).toMatchObject({ usdPerUnit: '1.0800000000', rateAsOf: tuesday, minorUnitExponent: 2 });

    const history = await persistence.listRateHistory({ code: 'EUR', limit: 10 });
    expect(history.map((rate) => rate.asOf)).toEqual([tuesday, monday]);
    expect(history[0]?.usdPerUnit).toBe(stored?.usdPerUnit);
  });

  it('collapses a provider retry onto one history row through the storage constraint', async () => {
    const persistence = repository(orm.em.fork());
    await persistence.upsertCurrency({ code: 'GBP', name: { en: 'Pound sterling' }, symbol: { default: '£' } });

    const asOf = new Date('2026-08-11T12:00:00.000Z');
    await persistence.recordRates([{ code: 'GBP', usdPerUnit: '1.2700000000', asOf, source: 'ecb' }]);
    await persistence.recordRates([{ code: 'GBP', usdPerUnit: '1.2700000000', asOf, source: 'ecb' }]);

    expect(await persistence.listRateHistory({ code: 'GBP', limit: 10 })).toHaveLength(1);

    // A second provider observing the same instant is a different observation, not a retry.
    await persistence.recordRates([{ code: 'GBP', usdPerUnit: '1.2690000000', asOf, source: 'boe' }]);
    expect(await persistence.listRateHistory({ code: 'GBP', limit: 10 })).toHaveLength(2);

    await expect(
      insert(orm.em, 'insert into fiat_currency_rates (id, code, as_of, source, usd_per_unit) values (?, ?, ?, ?, ?)', [
        '00000000-0000-4000-8000-000000000001',
        'GBP',
        asOf,
        'ecb',
        '1.2700000000',
      ]),
    ).rejects.toThrow(/uq__fiat_currency_rates__code_as_of_source/u);
  });

  it('refuses a rate for a currency the catalogue does not hold and writes none of the batch', async () => {
    const persistence = repository(orm.em.fork());
    await persistence.upsertCurrency({ code: 'CHF', name: { en: 'Swiss franc' }, symbol: { default: 'Fr' } });

    const asOf = new Date('2026-08-11T13:00:00.000Z');
    await expect(
      persistence.recordRates([
        { code: 'CHF', usdPerUnit: '1.1200000000', asOf, source: 'ecb' },
        { code: 'XXX', usdPerUnit: '1.0000000000', asOf, source: 'ecb' },
      ]),
    ).rejects.toThrow('XXX is not in the fiat catalogue');

    expect(await repository(orm.em.fork()).listRateHistory({ code: 'CHF', limit: 10 })).toEqual([]);
  });

  it('rejects a non-positive rate at the table, not only in the repository', async () => {
    await repository(orm.em.fork()).upsertCurrency({
      code: 'JPY',
      name: { en: 'Japanese yen' },
      symbol: { default: '¥' },
      minorUnitExponent: 0,
    });

    await expect(
      insert(orm.em, 'update fiat_currencies set usd_per_unit = ?, rate_as_of = now() where code = ?', ['0', 'JPY']),
    ).rejects.toThrow(/ck__fiat_currencies__usd_per_unit/u);
  });

  it('reads the locale maps back through jsonb exactly as an operator wrote them', async () => {
    const persistence = repository(orm.em.fork());
    await persistence.upsertCurrency({
      code: 'TRY',
      name: { en: 'Turkish lira', ru: 'Турецкая лира' },
      symbol: { default: '₺' },
      imageUrl: 'https://cdn.example.test/try.svg',
      displayOrder: 9,
    });
    // A second write replaces the whole map: the Russian name written above is gone, not merged
    // back in from the stored row.
    await persistence.upsertCurrency({ code: 'TRY', name: { en: 'Turkish Lira' }, symbol: { default: '₺' } });

    expect(await repository(orm.em.fork()).listCurrencies({ codes: ['TRY'] })).toEqual([
      expect.objectContaining({
        code: 'TRY',
        name: { en: 'Turkish Lira' },
        symbol: { default: '₺' },
        imageUrl: 'https://cdn.example.test/try.svg',
        displayOrder: 9,
      }),
    ]);

    expect(await persistence.deactivateCurrency('TRY')).toBe(true);
    expect(await repository(orm.em.fork()).listCurrencies({ activeOnly: true, codes: ['TRY'] })).toEqual([]);
  });

  it('rejects a name that is a json scalar rather than a map of locales', async () => {
    // jsonb happily stores `"Euro"`. Only the check constraint stops a reader from calling
    // getLocalization on a string, so it has to hold at the table and not only in the entity.
    await repository(orm.em.fork()).upsertCurrency({
      code: 'SEK',
      name: { en: 'Swedish krona' },
      symbol: { default: 'kr' },
    });

    await expect(
      insert(orm.em, 'update fiat_currencies set name = ?::jsonb where code = ?', ['"Swedish krona"', 'SEK']),
    ).rejects.toThrow(/ck__fiat_currencies__name/u);
  });
});

function repository(em: EntityManager): FiatCurrencyPostgresPersistence {
  return new FiatCurrencyPostgresPersistence(em);
}

async function insert(em: EntityManager, sql: string, params: unknown[]): Promise<unknown> {
  return await em.fork().getConnection().execute(sql, params);
}
