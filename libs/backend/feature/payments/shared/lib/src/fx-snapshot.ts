import type { CurrencyCode } from '@app/common-money';
import type { PaymentProblemCode } from './provider-problem-types';

/**
 * The FX snapshot rule (design §2.3).
 *
 * A snapshot is locked at creation — inside the same transaction that inserts
 * the `payments` row — and never modified afterwards (invariant 9). What
 * settles is always the provider's realized net amount, captured at `paid`
 * into the event evidence; the snapshot is the price the customer saw.
 */

/** One fiat-currency rate-history quote the snapshot may be built from. */
export interface RateHistoryQuote {
  /** USD per one unit of the quote currency, exact decimal text. */
  readonly usdPerUnit: string;
  readonly asOf: Date;
  /** The quote's stored provenance; it carries through into the snapshot. */
  readonly source: string;
}

/**
 * The shape persisted in `payments.fx_snapshot` jsonb (design §2.3):
 * `{ currency, usdPerUnit, asOf, source, feeInclusive, lockedAt }`.
 * Every lock function returns a frozen object — the "never mutated" half of
 * invariant 9 is enforced here, not just by convention.
 */
export interface FxSnapshot {
  readonly currency: CurrencyCode;
  readonly usdPerUnit: string;
  /** ISO-8601. */
  readonly asOf: string;
  readonly source: string;
  /** True for provider-sourced crypto rates, which embed spread/fee. */
  readonly feeInclusive: boolean;
  /** ISO-8601 — the creation moment the snapshot was locked at. */
  readonly lockedAt: string;
}

/**
 * No rate quote can price a fiat payment (design §2.3): creation fails closed
 * with `payment-fx-unavailable` (503) until the operator seeds the currency
 * in the fiat-currency catalogue.
 */
export class PaymentFxUnavailableError extends Error {
  readonly problemType: PaymentProblemCode;

  constructor(
    readonly currency: CurrencyCode,
    readonly asOf: Date,
  ) {
    super(
      `No fiat rate quote for ${currency} with asOf <= ${asOf.toISOString()}: seed the currency in the fiat-currency catalogue.`,
    );
    this.name = 'PaymentFxUnavailableError';
    this.problemType = 'payment-fx-unavailable';
  }
}

/**
 * The quote a fiat payment locks (design §2.3): the latest rate-history quote
 * for the payment currency with `asOf <=` the creation time. Fails closed
 * with {@link PaymentFxUnavailableError} when no such quote exists.
 */
export function selectFiatQuote(
  currency: CurrencyCode,
  quotes: readonly RateHistoryQuote[],
  at: Date,
): RateHistoryQuote {
  let best: RateHistoryQuote | undefined;

  for (const quote of quotes) {
    if (quote.asOf.getTime() > at.getTime()) {
      continue;
    }
    if (best === undefined || quote.asOf.getTime() >= best.asOf.getTime()) {
      best = quote;
    }
  }

  if (best === undefined) {
    throw new PaymentFxUnavailableError(currency, at);
  }

  return best;
}

/**
 * Lock a fiat payment's snapshot at creation: the USD-pivot quote selected by
 * {@link selectFiatQuote}, with the quote's stored `source` provenance carried
 * through and `feeInclusive: false` (it is a catalogue/market rate, not a
 * provider rate).
 */
export function lockFiatSnapshot(params: {
  currency: CurrencyCode;
  quote: RateHistoryQuote;
  /** The creation time — the moment the snapshot is locked (invariant 9). */
  lockedAt: Date;
}): FxSnapshot {
  return Object.freeze({
    currency: params.currency,
    usdPerUnit: params.quote.usdPerUnit,
    asOf: params.quote.asOf.toISOString(),
    source: params.quote.source,
    feeInclusive: false,
    lockedAt: params.lockedAt.toISOString(),
  });
}

/**
 * Lock a crypto invoice's display snapshot: the provider's own rate
 * (X-Rocket `/api/v1/rates`, Heleket exchange-rate list, NOWPayments
 * estimate), recorded as `source: 'provider:<code>'` with
 * `feeInclusive: true` so downstream math never mixes it with raw market
 * rates (design §2.3). The provider's realized net amount is captured at
 * `paid` into event evidence, never here.
 */
export function lockProviderRateSnapshot(params: {
  currency: CurrencyCode;
  provider: string;
  /** The provider rate, exact decimal text. */
  usdPerUnit: string;
  /** When the provider rate was observed. */
  asOf: Date;
  /** The creation time — the moment the snapshot is locked (invariant 9). */
  lockedAt: Date;
}): FxSnapshot {
  return Object.freeze({
    currency: params.currency,
    usdPerUnit: params.usdPerUnit,
    asOf: params.asOf.toISOString(),
    source: `provider:${params.provider}`,
    feeInclusive: true,
    lockedAt: params.lockedAt.toISOString(),
  });
}
