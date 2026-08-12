// @requirements REQ-FIAT-CATALOG-001
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { ListFiatCurrenciesQueryDto, ListFiatRatesQueryDto } from './fiat-currency.dto';

describe('fiat currency query DTOs', () => {
  it('reads a query-string boolean as the flag the caller meant', () => {
    // A query string carries text, and `Boolean('false')` is true — the exact bug that quietly
    // shows retired currencies to everyone who tried to switch the flag off.
    expect(plainToInstance(ListFiatCurrenciesQueryDto, { includeInactive: 'true' }).includeInactive).toBe(true);
    expect(plainToInstance(ListFiatCurrenciesQueryDto, { includeInactive: '1' }).includeInactive).toBe(true);
    expect(plainToInstance(ListFiatCurrenciesQueryDto, { includeInactive: 'false' }).includeInactive).toBe(false);
    expect(plainToInstance(ListFiatCurrenciesQueryDto, { includeInactive: true }).includeInactive).toBe(true);
  });

  it('leaves an unstated flag unstated rather than defaulting it to false', () => {
    expect(plainToInstance(ListFiatCurrenciesQueryDto, {}).includeInactive).toBeUndefined();
    expect(plainToInstance(ListFiatCurrenciesQueryDto, { includeInactive: undefined }).includeInactive).toBeUndefined();
    expect(plainToInstance(ListFiatCurrenciesQueryDto, { locale: 'ru' }).locale).toBe('ru');
  });

  it('reads a query-string number as a number', () => {
    const query = plainToInstance(ListFiatRatesQueryDto, { limit: '25', since: '2026-08-01T00:00:00.000Z' });

    expect(query.limit).toBe(25);
    expect(query.since).toBe('2026-08-01T00:00:00.000Z');
    expect(plainToInstance(ListFiatRatesQueryDto, {}).limit).toBeUndefined();
  });
});
