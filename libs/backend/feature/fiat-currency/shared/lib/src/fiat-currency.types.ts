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
  /** Canonical symbol, used when a locale has no override of its own. */
  readonly symbol: string;
  /** Flag or badge for the currency. Not localized — the artwork is the same in every language. */
  readonly imageUrl: string | null;
  /** Inactive currencies stay in the catalogue for historical amounts but are not offered. */
  readonly active: boolean;
  readonly displayOrder: number;
  readonly usdPerUnit: string | null;
  readonly rateAsOf: Date | null;
}

/**
 * A currency's name in one locale.
 *
 * Names live in a table rather than the static i18n catalogues because an operator adds a currency
 * at runtime, and a string added at runtime cannot come from a file that ships with the build.
 * `symbol` is nullable: most locales use the canonical one, and a null says "no override" rather
 * than duplicating it into every row.
 */
export interface FiatCurrencyTranslation {
  readonly code: CurrencyCode;
  readonly locale: string;
  readonly name: string;
  readonly symbol: string | null;
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
