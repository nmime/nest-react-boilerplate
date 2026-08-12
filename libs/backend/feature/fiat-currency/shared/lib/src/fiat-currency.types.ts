import type { Localizations } from '@app/common-i18n-runtime';
import type { CurrencyCode } from '@app/common-money';

/**
 * The fiat catalogue as the product owns it, on top of the pure arithmetic in `@app/common-money`.
 *
 * `@app/common-money` knows how many decimal places a currency has and how to add two amounts of
 * the same one. It deliberately knows nothing about exchange rates: `addMoney(usd, eur)` throws,
 * because a rate is operational data with a source and a timestamp, not a constant a library can
 * carry. This feature is where that data lives — one row per currency holding its current rate to
 * USD, its presentation, and an append-only history of every rate it has ever had.
 *
 * USD is the pivot. Storing every pair would be quadratic and would drift out of agreement with
 * itself; storing one rate per currency and converting through USD keeps the catalogue linear and
 * internally consistent, at the cost of one extra rounding step on a cross pair.
 */

/**
 * One currency's rate, as the amount of USD a single major unit buys.
 *
 * Decimal text, never a float: `1.0812345678` is not representable as a double, and the error
 * lands on real money. {@link fiatRateRatio} turns it into an exact ratio.
 */
export interface FiatRateQuote {
  readonly code: CurrencyCode;
  readonly usdPerUnit: string;
}

/** A quote as recorded: what it was, when it was true, and who said so. */
export interface FiatCurrencyRate extends FiatRateQuote {
  readonly asOf: Date;
  /** Provenance — the rate provider id, or `manual` when an operator typed it in. */
  readonly source: string;
}

/** A row of the fiat catalogue. `usdPerUnit` is null until the first rate is recorded. */
export interface FiatCurrency {
  readonly code: CurrencyCode;
  /** Decimal places in the minor unit. Mirrors `currencyMinorUnitExponent` so a row is self-describing. */
  readonly minorUnitExponent: number;
  /**
   * The currency's name per locale, as one JSON value rather than a row per language.
   *
   * A name is only ever read with the currency it belongs to and is written in the same operation,
   * so the second table it used to live in bought a join and an ordering constraint for nothing.
   * {@link Localizations} is the workspace's shape for this: keys are supported locales plus
   * `default`, and {@link getLocalization} resolves one through the locale fallback chain.
   */
  readonly name: Localizations<string>;
  /**
   * The symbol per locale. `default` carries the one most locales use; name a locale only where it
   * genuinely differs, rather than copying `€` into every language.
   */
  readonly symbol: Localizations<string>;
  /** Flag or badge for the currency. Not localized — the artwork is the same in every language. */
  readonly imageUrl: string | null;
  /** Inactive currencies stay in the catalogue for historical amounts but are not offered. */
  readonly active: boolean;
  readonly displayOrder: number;
  readonly usdPerUnit: string | null;
  readonly rateAsOf: Date | null;
}

/** A catalogue row resolved for one reader. */
export interface LocalizedFiatCurrency {
  readonly code: CurrencyCode;
  readonly name: string;
  readonly symbol: string;
  readonly imageUrl: string | null;
  readonly minorUnitExponent: number;
  readonly usdPerUnit: string | null;
  readonly rateAsOf: Date | null;
}
