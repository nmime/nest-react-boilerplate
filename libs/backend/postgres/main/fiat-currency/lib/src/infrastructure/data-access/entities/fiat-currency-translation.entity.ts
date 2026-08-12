import { EntitySchema } from '@mikro-orm/core';
import type { CurrencyCode } from '@app/common-money';

export interface FiatCurrencyTranslationEntityInput {
  code: CurrencyCode;
  locale: string;
  name: string;
  symbol?: string | null;
}

/**
 * One currency's name in one locale.
 *
 * Keyed by `(code, locale)` rather than a surrogate id, which makes "one name per locale" a
 * property of the table instead of a rule the application has to remember. `symbol` stays null
 * when the locale uses the canonical one, so adding a locale does not fan the symbol out into
 * rows that all have to change together when it is corrected.
 */
export class FiatCurrencyTranslationEntity {
  code!: CurrencyCode;
  locale!: string;
  name!: string;
  symbol: string | null = null;

  constructor(input?: FiatCurrencyTranslationEntityInput) {
    if (input) {
      this.code = input.code;
      this.locale = input.locale;
      this.name = input.name;
      this.symbol = input.symbol ?? null;
    }
  }
}

export const FiatCurrencyTranslationEntitySchema = new EntitySchema<FiatCurrencyTranslationEntity>({
  class: FiatCurrencyTranslationEntity,
  tableName: 'fiat_currency_translations',
  properties: {
    code: { type: 'varchar', length: 3, primary: true },
    // BCP 47 tags top out at 35 characters for anything this workspace will ever serve.
    locale: { type: 'varchar', length: 35, primary: true },
    name: { type: 'varchar', length: 120 },
    symbol: { type: 'varchar', length: 16, nullable: true },
  },
  indexes: [{ name: 'ix__fiat_currency_translations__locale', properties: ['locale'] }],
});
