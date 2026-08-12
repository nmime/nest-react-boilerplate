// @requirements REQ-FIAT-CATALOG-001
import type { FiatCurrencyRate, LocalizedFiatCurrency } from '@app/backend-feature-fiat-currency-shared';
import { describe, expect, it, vi } from 'vitest';
import type { FiatCurrencyService } from '../service';
import { FiatCurrencyController } from './fiat-currency.controller';

const asOf = new Date('2026-08-12T00:00:00.000Z');

const euro: LocalizedFiatCurrency = {
  code: 'EUR',
  name: 'Euro',
  symbol: '€',
  imageUrl: null,
  minorUnitExponent: 2,
  usdPerUnit: '1.08',
  rateAsOf: asOf,
};

function createController() {
  const listCurrencies = vi.fn((_locale: string, _options?: unknown) => Promise.resolve([euro]));
  const listRateHistory = vi.fn((_request: unknown) =>
    Promise.resolve<FiatCurrencyRate[]>([{ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }]),
  );
  const service = { listCurrencies, listRateHistory } as unknown as FiatCurrencyService;

  return { listCurrencies, listRateHistory, controller: new FiatCurrencyController(service) };
}

describe('FiatCurrencyController', () => {
  it('answers the catalogue in the locale the request asked for', async () => {
    const { listCurrencies, controller } = createController();

    const response = await controller.list({}, { headers: { 'accept-language': 'ru-RU' } });

    expect(listCurrencies).toHaveBeenCalledWith('ru', { includeInactive: false });
    expect(response.data.items[0]).toEqual({
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      imageUrl: null,
      minorUnitExponent: 2,
      usdPerUnit: '1.08',
      rateAsOf: asOf.toISOString(),
    });
  });

  it('lets a caller override the locale and ask for retired currencies', async () => {
    const { listCurrencies, controller } = createController();

    await controller.list({ locale: 'de', includeInactive: true }, { headers: {} });

    expect(listCurrencies).toHaveBeenCalledWith('de', { includeInactive: true });
  });

  it('serializes a currency that has never been priced', async () => {
    const { listCurrencies, controller } = createController();
    listCurrencies.mockResolvedValue([{ ...euro, usdPerUnit: null, rateAsOf: null }]);

    const response = await controller.list({}, { headers: {} });

    expect(response.data.items[0]).toMatchObject({ usdPerUnit: null, rateAsOf: null });
  });

  it('reads rate history for one currency over an optional window', async () => {
    const { listRateHistory, controller } = createController();

    const response = await controller.listRates('EUR', {
      since: '2026-08-01T00:00:00.000Z',
      until: '2026-08-12T00:00:00.000Z',
      limit: 25,
    });

    expect(listRateHistory).toHaveBeenCalledWith({
      code: 'EUR',
      since: new Date('2026-08-01T00:00:00.000Z'),
      until: new Date('2026-08-12T00:00:00.000Z'),
      limit: 25,
    });
    expect(response.data.items).toEqual([{ code: 'EUR', usdPerUnit: '1.08', asOf: asOf.toISOString(), source: 'ecb' }]);
  });

  it('reads unbounded history when the request states no window', async () => {
    const { listRateHistory, controller } = createController();

    await controller.listRates('EUR', {});

    expect(listRateHistory).toHaveBeenCalledWith({ code: 'EUR', since: undefined, until: undefined, limit: undefined });
  });
});
