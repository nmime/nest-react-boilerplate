import type { CurrencyCode } from '@app/common-money';
import type { FiatCurrency, FiatCurrencyRate, FiatCurrencyTranslation } from './fiat-currency.types';

export interface ListFiatCurrenciesFilter {
  /** Omits currencies an operator has retired. Historical amounts still resolve through `find`. */
  activeOnly?: boolean;
  codes?: readonly CurrencyCode[];
}

export interface UpsertFiatCurrencyTranslation {
  locale: string;
  name: string;
  symbol?: string | null;
}

export interface UpsertFiatCurrencyParams {
  code: CurrencyCode;
  /** Defaults to the ISO exponent for the code when the caller does not say. */
  minorUnitExponent?: number;
  symbol: string;
  imageUrl?: string | null;
  active?: boolean;
  displayOrder?: number;
  /** Replaces the locales named here and leaves any others alone. */
  translations?: readonly UpsertFiatCurrencyTranslation[];
}

export interface RecordFiatRateParams {
  code: CurrencyCode;
  usdPerUnit: string;
  asOf: Date;
  /** Provider id, or `manual` when an operator typed it in. */
  source: string;
}

export interface ListFiatRateHistoryQuery {
  code: CurrencyCode;
  /** Inclusive lower bound on `asOf`. */
  since?: Date;
  /** Exclusive upper bound on `asOf`. */
  until?: Date;
  limit: number;
}

/**
 * Persistence boundary for the fiat catalogue.
 *
 * Implementations own transactions, entity mapping, and the rule that writing a rate both appends
 * to the history and advances the currency's current rate in one atomic step. Feature code must
 * never depend on database entities directly — that is what lets the same service run on the
 * Postgres and MongoDB axes without a branch.
 */
export abstract class FiatCurrencyPersistence {
  abstract listCurrencies(filter: ListFiatCurrenciesFilter): Promise<FiatCurrency[]>;

  abstract findCurrency(code: CurrencyCode): Promise<FiatCurrency | null>;

  abstract listTranslations(codes: readonly CurrencyCode[]): Promise<FiatCurrencyTranslation[]>;

  abstract upsertCurrency(params: UpsertFiatCurrencyParams): Promise<FiatCurrency>;

  /** Retires a currency without deleting it; returns false when the code is unknown. */
  abstract deactivateCurrency(code: CurrencyCode): Promise<boolean>;

  /**
   * Appends rates to the history and advances each currency's current rate.
   *
   * A rate older than the one already stored appends to the history but must not move the current
   * rate backwards: providers retry, and a late arrival of yesterday's number is not news.
   */
  abstract recordRates(rates: readonly RecordFiatRateParams[]): Promise<FiatCurrencyRate[]>;

  abstract listRateHistory(query: ListFiatRateHistoryQuery): Promise<FiatCurrencyRate[]>;
}

/**
 * Where rates come from.
 *
 * Deliberately a port with no bundled implementation. Every rate provider has its own auth, quota,
 * and licence terms, and a hardcoded default would be exactly the closed catalogue this workspace
 * keeps removing — a product wires its own and registers it, or an operator types rates in by hand
 * and never provides one at all.
 */
export abstract class FiatRateSource {
  /** Recorded as the `source` of every rate this provider yields. */
  abstract readonly id: string;

  abstract fetchUsdRates(codes: readonly CurrencyCode[]): Promise<readonly FiatRateQuoteResult[]>;
}

export interface FiatRateQuoteResult {
  code: CurrencyCode;
  usdPerUnit: string;
  asOf: Date;
}
