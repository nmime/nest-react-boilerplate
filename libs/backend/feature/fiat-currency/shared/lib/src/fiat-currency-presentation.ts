import { getLocalization } from '@app/common-i18n-runtime';
import type { FiatCurrency, LocalizedFiatCurrency } from './fiat-currency.types';

/**
 * Resolves a catalogue row for one reader.
 *
 * `getLocalization` walks the locale fallback chain over the keys the field actually carries, so a
 * `ru-RU` reader gets the `ru` name instead of skipping past it to `default`. A field with nothing
 * usable degrades to the currency code: a list endpoint that 500s because nobody typed a Georgian
 * name for the Lari is a worse outcome than one that shows `GEL`.
 */
export function localizeFiatCurrency(currency: FiatCurrency, locale: string): LocalizedFiatCurrency {
  return {
    code: currency.code,
    name: getLocalization(currency.name, locale) ?? currency.code,
    symbol: getLocalization(currency.symbol, locale) ?? currency.code,
    imageUrl: currency.imageUrl,
    minorUnitExponent: currency.minorUnitExponent,
    usdPerUnit: currency.usdPerUnit,
    rateAsOf: currency.rateAsOf,
  };
}

/**
 * Catalogue order: the operator's `displayOrder` first, then the code.
 *
 * The tiebreak is not decoration. Two currencies sharing a display order otherwise come back in
 * whatever order the database happened to scan, which makes a paged list drop and repeat rows
 * between pages.
 */
export function sortFiatCurrencies<T extends Pick<FiatCurrency, 'code' | 'displayOrder'>>(
  currencies: readonly T[],
): T[] {
  return [...currencies].sort(
    (left, right) => left.displayOrder - right.displayOrder || left.code.localeCompare(right.code),
  );
}
