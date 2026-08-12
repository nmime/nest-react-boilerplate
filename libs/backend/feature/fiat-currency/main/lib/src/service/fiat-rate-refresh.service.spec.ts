// @requirements REQ-FIAT-RATE-002
import {
  type FiatCurrency,
  type FiatCurrencyRate,
  FiatCurrencyPersistence,
  type FiatRateQuoteResult,
  FiatRateSource,
  type ListFiatCurrenciesFilter,
  type ListFiatRateHistoryQuery,
  type RecordFiatRateParams,
  type UpsertFiatCurrencyParams,
} from '@app/backend-feature-fiat-currency-shared';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FiatRateRefreshService } from './fiat-rate-refresh.service';

const asOf = new Date('2026-08-12T00:00:00.000Z');

function currency(code: string): FiatCurrency {
  return {
    code,
    minorUnitExponent: 2,
    symbol: code,
    imageUrl: null,
    active: true,
    displayOrder: 0,
    usdPerUnit: null,
    rateAsOf: null,
  };
}

class StubPersistence extends FiatCurrencyPersistence {
  currencies: FiatCurrency[] = [currency('EUR'), currency('GBP')];
  readonly listCurrencies = vi.fn((_filter: ListFiatCurrenciesFilter) => Promise.resolve(this.currencies));
  readonly findCurrency = vi.fn((_code: string) => Promise.resolve<FiatCurrency | null>(null));
  readonly listTranslations = vi.fn(() => Promise.resolve([]));
  readonly upsertCurrency = vi.fn((_params: UpsertFiatCurrencyParams) => Promise.resolve(currency('EUR')));
  readonly deactivateCurrency = vi.fn((_code: string) => Promise.resolve(true));
  readonly recordRates = vi.fn((rates: readonly RecordFiatRateParams[]) =>
    Promise.resolve(rates.map((rate) => ({ ...rate }) as FiatCurrencyRate)),
  );
  readonly listRateHistory = vi.fn((_query: ListFiatRateHistoryQuery) => Promise.resolve([]));
}

class StubSource extends FiatRateSource {
  constructor(
    readonly id: string,
    readonly fetchUsdRates: (codes: readonly string[]) => Promise<readonly FiatRateQuoteResult[]>,
  ) {
    super();
  }
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

describe('FiatRateRefreshService', () => {
  it('records every quote a source returns, stamped with that source', async () => {
    const persistence = new StubPersistence();
    const source = new StubSource('ecb', () =>
      Promise.resolve([{ code: 'EUR', usdPerUnit: '1.08', asOf }] as FiatRateQuoteResult[]),
    );

    const summary = await new FiatRateRefreshService(persistence, [source]).refresh();

    expect(persistence.listCurrencies).toHaveBeenCalledWith({ activeOnly: true });
    expect(persistence.recordRates).toHaveBeenCalledWith([{ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }]);
    expect(summary).toEqual({ recorded: 1, failures: [] });
  });

  it('asks each source only for the currencies the catalogue actually holds', async () => {
    const persistence = new StubPersistence();
    const fetchUsdRates = vi.fn(() => Promise.resolve([]));

    await new FiatRateRefreshService(persistence, [new StubSource('ecb', fetchUsdRates)]).refresh();

    expect(fetchUsdRates).toHaveBeenCalledWith(['EUR', 'GBP']);
  });

  it('lets the other sources finish when one of them fails', async () => {
    const persistence = new StubPersistence();
    const failing = new StubSource('broken', () => Promise.reject(new Error('429 Too Many Requests')));
    const working = new StubSource('ecb', () =>
      Promise.resolve([{ code: 'EUR', usdPerUnit: '1.08', asOf }] as FiatRateQuoteResult[]),
    );

    const summary = await new FiatRateRefreshService(persistence, [failing, working]).refresh();

    expect(summary).toEqual({ recorded: 1, failures: [{ source: 'broken', reason: '429 Too Many Requests' }] });
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('reports a failure that was not thrown as an Error', async () => {
    const persistence = new StubPersistence();
    const source = new StubSource('broken', () => Promise.reject('gateway closed'));

    const summary = await new FiatRateRefreshService(persistence, [source]).refresh();

    expect(summary.failures).toEqual([{ source: 'broken', reason: 'gateway closed' }]);
  });

  it('does nothing at all when no provider is registered', async () => {
    const persistence = new StubPersistence();

    expect(await new FiatRateRefreshService(persistence, []).refresh()).toEqual({ recorded: 0, failures: [] });
    expect(persistence.listCurrencies).not.toHaveBeenCalled();
  });

  it('does not call a provider for an empty catalogue', async () => {
    const persistence = new StubPersistence();
    persistence.currencies = [];
    const fetchUsdRates = vi.fn(() => Promise.resolve([]));

    expect(await new FiatRateRefreshService(persistence, [new StubSource('ecb', fetchUsdRates)]).refresh()).toEqual({
      recorded: 0,
      failures: [],
    });
    expect(fetchUsdRates).not.toHaveBeenCalled();
  });

  it('does not open a write for a source that returned nothing', async () => {
    const persistence = new StubPersistence();

    await new FiatRateRefreshService(persistence, [new StubSource('ecb', () => Promise.resolve([]))]).refresh();

    expect(persistence.recordRates).not.toHaveBeenCalled();
  });
});
