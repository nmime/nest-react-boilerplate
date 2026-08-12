import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { CurrencyCode } from '@app/common-money';

export interface FiatCurrencyRateEntityInput {
  code: CurrencyCode;
  usdPerUnit: string;
  asOf: Date;
  source: string;
}

/**
 * One observation of a currency's USD rate.
 *
 * Append-only. `asOf` is when the rate was true and `recordedAt` is when this row was written;
 * they differ whenever a provider backfills, and keeping both is what lets a disputed amount be
 * recomputed with the rate the system actually knew at the time.
 *
 * The uniqueness of `(code, asOf, source)` makes a provider retry a no-op rather than a duplicate:
 * fetching the same quote twice is normal, and two rows for it would silently double-count in any
 * aggregate over the history.
 */
export class FiatCurrencyRateEntity {
  id: string = randomUUID();
  code!: CurrencyCode;
  usdPerUnit!: string;
  asOf: Date = new Date();
  source!: string;
  recordedAt: Date = new Date();

  constructor(input?: FiatCurrencyRateEntityInput) {
    if (input) {
      this.code = input.code;
      this.usdPerUnit = input.usdPerUnit;
      this.asOf = input.asOf;
      this.source = input.source;
    }
  }
}

export const FiatCurrencyRateEntitySchema = new EntitySchema<FiatCurrencyRateEntity>({
  class: FiatCurrencyRateEntity,
  tableName: 'fiat_currency_rates',
  properties: {
    id: { type: 'uuid', primary: true },
    code: { type: 'varchar', length: 3 },
    usdPerUnit: { type: 'decimal', fieldName: 'usd_per_unit', precision: 15, scale: 10 },
    asOf: { type: 'timestamptz', fieldName: 'as_of' },
    source: { type: 'varchar', length: 64 },
    recordedAt: { type: 'timestamptz', fieldName: 'recorded_at', onCreate: () => new Date() },
  },
  indexes: [{ name: 'ix__fiat_currency_rates__code_as_of_desc', properties: ['code', 'asOf'] }],
  uniques: [{ name: 'uq__fiat_currency_rates__code_as_of_source', properties: ['code', 'asOf', 'source'] }],
  checks: [{ name: 'ck__fiat_currency_rates__usd_per_unit', expression: '"usd_per_unit" > 0' }],
});
