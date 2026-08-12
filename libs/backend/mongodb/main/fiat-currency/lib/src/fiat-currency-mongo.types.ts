import type { CurrencyCode } from '@app/common-money';

/**
 * A currency document, keyed by its own code.
 *
 * Translations are embedded rather than kept in a second collection: a currency has a handful of
 * names, they are only ever read with the currency itself, and they change when it does. That is
 * the case embedding is for, and it means a catalogue page is one query on this axis too.
 */
export interface FiatCurrencyDocument {
  _id: CurrencyCode;
  minorUnitExponent: number;
  symbol: string;
  imageUrl: string | null;
  active: boolean;
  displayOrder: number;
  usdPerUnit: string | null;
  rateAsOf: Date | null;
  translations: FiatCurrencyTranslationDocument[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FiatCurrencyTranslationDocument {
  locale: string;
  name: string;
  symbol: string | null;
}

export interface FiatCurrencyRateDocument {
  _id: string;
  code: CurrencyCode;
  usdPerUnit: string;
  asOf: Date;
  source: string;
  recordedAt: Date;
}
