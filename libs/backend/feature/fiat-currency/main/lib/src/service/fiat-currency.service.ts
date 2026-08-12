import {
  type FiatCurrency,
  type FiatCurrencyRate,
  FiatCurrencyPersistence,
  type ListFiatRateHistoryQuery,
  type LocalizedFiatCurrency,
  type UpsertFiatCurrencyParams,
  convertFiatMoney,
  fiatCurrencyRateQuote,
  localizeFiatCurrency,
  sortFiatCurrencies,
} from '@app/backend-feature-fiat-currency-shared';
import type { CurrencyCode, Money, MoneyRounding } from '@app/common-money';
import { Injectable } from '@nestjs/common';

export interface ListFiatCurrenciesOptions {
  /** Includes currencies an operator has retired. Off by default: a picker should not offer them. */
  includeInactive?: boolean;
}

/** A history request as callers may state it: `limit` is optional here and bounded by the service. */
export type FiatRateHistoryRequest = Omit<ListFiatRateHistoryQuery, 'limit'> & { limit?: number };

/** What a caller gets when no limit is stated. */
const defaultRateHistoryLimit = 100;
/** The most any single history request may ask for, whatever it says. */
const maxRateHistoryLimit = 1_000;

/**
 * The fiat catalogue as the rest of the backend uses it.
 *
 * Everything here goes through {@link FiatCurrencyPersistence}, so the service is identical on the
 * Postgres and MongoDB axes. It holds the two rules that are neither storage nor arithmetic: which
 * currencies a reader is allowed to see, and how much history one request may ask for.
 */
@Injectable()
export class FiatCurrencyService {
  constructor(private readonly persistence: FiatCurrencyPersistence) {}

  /**
   * The catalogue resolved for one reader, in operator order.
   *
   * One read: the localized name and symbol are fields on the currency, so there is no second query
   * to batch and no N+1 to reintroduce by looping.
   */
  async listCurrencies(locale: string, options: ListFiatCurrenciesOptions = {}): Promise<LocalizedFiatCurrency[]> {
    const currencies = sortFiatCurrencies(
      await this.persistence.listCurrencies({ activeOnly: options.includeInactive !== true }),
    );

    return currencies.map((entry) => localizeFiatCurrency(entry, locale));
  }

  findCurrency(code: CurrencyCode): Promise<FiatCurrency | null> {
    return this.persistence.findCurrency(code);
  }

  /**
   * Converts an amount through the stored USD rates.
   *
   * A missing currency, or one whose rate has never been recorded, throws rather than falling back
   * to 1:1. There is no safe default for an exchange rate.
   */
  async convert(value: Money, to: CurrencyCode, rounding: MoneyRounding = 'half-even'): Promise<Money> {
    const [from, target] = await Promise.all([this.requireCurrency(value.currency), this.requireCurrency(to)]);

    return convertFiatMoney(value, fiatCurrencyRateQuote(from), fiatCurrencyRateQuote(target), rounding);
  }

  listRateHistory(request: FiatRateHistoryRequest): Promise<FiatCurrencyRate[]> {
    return this.persistence.listRateHistory({
      ...request,
      limit: Math.min(request.limit ?? defaultRateHistoryLimit, maxRateHistoryLimit),
    });
  }

  upsertCurrency(params: UpsertFiatCurrencyParams): Promise<FiatCurrency> {
    return this.persistence.upsertCurrency(params);
  }

  deactivateCurrency(code: CurrencyCode): Promise<boolean> {
    return this.persistence.deactivateCurrency(code);
  }

  private async requireCurrency(code: CurrencyCode): Promise<FiatCurrency> {
    const currency = await this.persistence.findCurrency(code);

    if (!currency) {
      throw new Error(`${code} is not in the fiat catalogue.`);
    }

    return currency;
  }
}
