import { localeFallbackChain } from '@app/common-i18n-runtime';
import type { FiatCurrency, FiatCurrencyTranslation, LocalizedFiatCurrency } from './fiat-currency.types';

/**
 * Resolves a catalogue row for one reader.
 *
 * The lookup walks the locale fallback chain over the locales that actually have a row, so a
 * `ru-RU` reader gets the `ru` name instead of skipping past it to English. A missing translation
 * degrades to the currency code: a list endpoint that 500s because nobody typed a Georgian name
 * for the Lari is a worse outcome than one that shows `GEL`.
 */
export function localizeFiatCurrency(
  currency: FiatCurrency,
  translations: readonly FiatCurrencyTranslation[],
  locale: string,
): LocalizedFiatCurrency {
  const own = translations.filter((entry) => entry.code === currency.code);
  const byLocale = new Map(own.map((entry) => [entry.locale, entry]));
  const chain = localeFallbackChain(locale, { supported: own.map((entry) => entry.locale) });
  const resolved = chain.map((candidate) => byLocale.get(candidate)).find((entry) => entry !== undefined);

  return {
    code: currency.code,
    name: resolved?.name ?? currency.code,
    symbol: resolved?.symbol ?? currency.symbol,
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
