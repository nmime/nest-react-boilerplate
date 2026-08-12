import { EntitySchema } from '@mikro-orm/core';
import { type CurrencyCode, currencyMinorUnitExponent } from '@app/common-money';

export interface FiatCurrencyEntityInput {
  code: CurrencyCode;
  symbol: string;
  minorUnitExponent?: number;
  imageUrl?: string | null;
  active?: boolean;
  displayOrder?: number;
  usdPerUnit?: string | null;
  rateAsOf?: Date | null;
}

/**
 * A currency in the catalogue, keyed by its own code.
 *
 * No surrogate id: the ISO code is already unique, stable, and the value every other table and
 * every API payload carries. A uuid here would add a join to reach a string the caller already
 * has.
 *
 * `usdPerUnit` is the current rate as decimal text. It is denormalized from the newest history
 * row on purpose — the alternative is a correlated subquery on every list request, and the list
 * request is the hot path.
 */
export class FiatCurrencyEntity {
  code!: CurrencyCode;
  minorUnitExponent = 2;
  symbol!: string;
  imageUrl: string | null = null;
  active = true;
  displayOrder = 0;
  usdPerUnit: string | null = null;
  rateAsOf: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: FiatCurrencyEntityInput) {
    if (input) {
      this.code = input.code;
      this.symbol = input.symbol;
      this.minorUnitExponent = input.minorUnitExponent ?? currencyMinorUnitExponent(input.code);
      this.imageUrl = input.imageUrl ?? null;
      this.active = input.active ?? true;
      this.displayOrder = input.displayOrder ?? 0;
      this.usdPerUnit = input.usdPerUnit ?? null;
      this.rateAsOf = input.rateAsOf ?? null;
    }
  }
}

export const FiatCurrencyEntitySchema = new EntitySchema<FiatCurrencyEntity>({
  class: FiatCurrencyEntity,
  tableName: 'fiat_currencies',
  properties: {
    code: { type: 'varchar', length: 3, primary: true },
    minorUnitExponent: { type: 'smallint', fieldName: 'minor_unit_exponent', default: 2 },
    symbol: { type: 'varchar', length: 16 },
    imageUrl: { type: 'text', fieldName: 'image_url', nullable: true },
    active: { type: 'boolean', default: true },
    displayOrder: { type: 'integer', fieldName: 'display_order', default: 0 },
    // Read back as text: the driver would otherwise hand back a float and undo the whole point
    // of storing an exact decimal.
    usdPerUnit: { type: 'decimal', fieldName: 'usd_per_unit', precision: 15, scale: 10, nullable: true },
    rateAsOf: { type: 'timestamptz', fieldName: 'rate_as_of', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  indexes: [{ name: 'ix__fiat_currencies__active_display_order', properties: ['active', 'displayOrder'] }],
  checks: [
    { name: 'ck__fiat_currencies__code', expression: '"code" ~ \'^[A-Z]{3}$\'' },
    {
      name: 'ck__fiat_currencies__minor_unit_exponent',
      expression: '"minor_unit_exponent" between 0 and 12',
    },
    {
      name: 'ck__fiat_currencies__usd_per_unit',
      expression: '"usd_per_unit" is null or "usd_per_unit" > 0',
    },
    {
      name: 'ck__fiat_currencies__rate_pairing',
      expression: '("usd_per_unit" is null) = ("rate_as_of" is null)',
    },
  ],
});
