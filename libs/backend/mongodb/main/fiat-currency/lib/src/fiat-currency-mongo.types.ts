import type { Localizations } from '@app/common-i18n-runtime';
import type { CurrencyCode } from '@app/common-money';

/**
 * A currency document, keyed by its own code.
 *
 * `name` and `symbol` are locale maps on the document itself, mirroring the jsonb columns on the
 * Postgres axis. Two axes behind one port only stay interchangeable while they store the same
 * shape: an array of `{locale, name}` here and a map there would differ in what a partial write
 * means, and the difference would only show up in whichever axis a product forgot to test.
 */
export interface FiatCurrencyDocument {
  _id: CurrencyCode;
  minorUnitExponent: number;
  name: Localizations<string>;
  symbol: Localizations<string>;
  imageUrl: string | null;
  active: boolean;
  displayOrder: number;
  usdPerUnit: string | null;
  rateAsOf: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FiatCurrencyRateDocument {
  _id: string;
  code: CurrencyCode;
  usdPerUnit: string;
  asOf: Date;
  source: string;
  recordedAt: Date;
}
