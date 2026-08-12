// @requirements REQ-FIAT-HISTORY-003
import { describe, expect, it } from 'vitest';
import {
  FiatCurrencyEntity,
  FiatCurrencyEntitySchema,
  FiatCurrencyRateEntity,
  FiatCurrencyRateEntitySchema,
} from './index';

const invokeLifecycleHook = (hook: unknown): unknown => (hook as (() => unknown) | undefined)?.();

describe('FiatCurrencyEntity', () => {
  it('starts a currency active, unrated, and at the ISO minor unit', () => {
    const entity = new FiatCurrencyEntity({ code: 'EUR', name: { en: 'Euro' }, symbol: { default: '€' } });

    expect(entity).toMatchObject({
      code: 'EUR',
      name: { en: 'Euro' },
      symbol: { default: '€' },
      minorUnitExponent: 2,
      imageUrl: null,
      active: true,
      displayOrder: 0,
      usdPerUnit: null,
      rateAsOf: null,
    });
  });

  it('takes the minor unit from the currency rather than assuming two places', () => {
    expect(new FiatCurrencyEntity({ code: 'JPY' }).minorUnitExponent).toBe(0);
    expect(new FiatCurrencyEntity({ code: 'BHD' }).minorUnitExponent).toBe(3);
  });

  it('starts the locale maps empty rather than null', () => {
    // The column is `not null default '{}'`, so an entity that models the absent case as null would
    // hand the driver a value the table rejects. An empty map is the honest representation of "no
    // name has been typed yet", and the presentation layer already degrades that to the code.
    const entity = new FiatCurrencyEntity({ code: 'EUR' });

    expect(entity.name).toEqual({});
    expect(entity.symbol).toEqual({});
  });

  it('preserves explicitly supplied fields', () => {
    const rateAsOf = new Date('2026-08-12T00:00:00.000Z');
    const entity = new FiatCurrencyEntity({
      code: 'EUR',
      name: { en: 'Euro', ru: 'Евро' },
      symbol: { default: '€' },
      minorUnitExponent: 2,
      imageUrl: 'https://cdn.example.test/eur.svg',
      active: false,
      displayOrder: 30,
      usdPerUnit: '1.08',
      rateAsOf,
    });

    expect(entity).toMatchObject({
      name: { en: 'Euro', ru: 'Евро' },
      imageUrl: 'https://cdn.example.test/eur.svg',
      active: false,
      displayOrder: 30,
      usdPerUnit: '1.08',
      rateAsOf,
    });
  });

  it('defaults every field when constructed without input', () => {
    const entity = new FiatCurrencyEntity();

    expect(entity.active).toBe(true);
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it('maps to the fiat_currencies table keyed by its code', () => {
    expect(FiatCurrencyEntitySchema.meta.tableName).toBe('fiat_currencies');
    expect(FiatCurrencyEntitySchema.meta.properties.code.primary).toBe(true);
    expect(FiatCurrencyEntitySchema.meta.checks?.map((check) => check.name)).toEqual([
      'ck__fiat_currencies__code',
      'ck__fiat_currencies__minor_unit_exponent',
      'ck__fiat_currencies__name',
      'ck__fiat_currencies__symbol',
      'ck__fiat_currencies__usd_per_unit',
      'ck__fiat_currencies__rate_pairing',
    ]);
  });

  it('stores the locale maps as json so the column check can see an object', () => {
    // `text` would round-trip the map through JSON.stringify and defeat `jsonb_typeof`, which is
    // the only guard against an admin payload writing `"Euro"` into a field the reader treats as a
    // map of locales.
    expect(FiatCurrencyEntitySchema.meta.properties.name.type).toBe('json');
    expect(FiatCurrencyEntitySchema.meta.properties.symbol.type).toBe('json');
  });

  it('defines timestamp lifecycle hooks', () => {
    FiatCurrencyEntitySchema.init();

    expect(invokeLifecycleHook(FiatCurrencyEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(FiatCurrencyEntitySchema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeLifecycleHook(FiatCurrencyEntitySchema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
  });
});

describe('FiatCurrencyRateEntity', () => {
  it('records what the rate was, when it was true, and who said so', () => {
    const asOf = new Date('2026-08-12T00:00:00.000Z');
    const entity = new FiatCurrencyRateEntity({ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'manual' });

    expect(entity).toMatchObject({ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'manual' });
    expect(entity.id).toMatch(/[0-9a-f-]{36}/u);
  });

  it('defaults every field when constructed without input', () => {
    const entity = new FiatCurrencyRateEntity();

    expect(entity.asOf).toBeInstanceOf(Date);
    expect(entity.recordedAt).toBeInstanceOf(Date);
  });

  it('accepts one quote per source and instant so a provider retry is idempotent', () => {
    expect(FiatCurrencyRateEntitySchema.meta.tableName).toBe('fiat_currency_rates');
    expect(FiatCurrencyRateEntitySchema.meta.uniques).toContainEqual({
      name: 'uq__fiat_currency_rates__code_as_of_source',
      properties: ['code', 'asOf', 'source'],
    });
    expect(FiatCurrencyRateEntitySchema.meta.indexes).toContainEqual({
      name: 'ix__fiat_currency_rates__code_as_of_desc',
      properties: ['code', 'asOf'],
    });
  });

  it('defines a recorded-at lifecycle hook', () => {
    FiatCurrencyRateEntitySchema.init();

    expect(invokeLifecycleHook(FiatCurrencyRateEntitySchema.meta.properties.recordedAt.onCreate)).toBeInstanceOf(Date);
  });
});
