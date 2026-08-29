/**
 * The normalized provider vocabulary (design §4.0).
 *
 * Every adapter maps its vendor's raw status strings onto these values;
 * nothing downstream branches on vendor literals. `underpaid` and `aml_hold`
 * are provider facts, not payment states — the state machine (design §2.1)
 * decides what payment status each implies: underpaid stays in flight
 * (invariant 5), aml_hold fails the payment with a sub-reason.
 */

export const NormalizedProviderStatuses = [
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'expired',
  'underpaid',
  'aml_hold',
] as const;

export type NormalizedProviderStatus = (typeof NormalizedProviderStatuses)[number];

export function isNormalizedProviderStatus(value: string): value is NormalizedProviderStatus {
  return (NormalizedProviderStatuses as readonly string[]).includes(value);
}

/** One webhook event after provider-specific parsing, before any business. */
export interface NormalizedWebhookEvent {
  /** Our payment id when the provider carries it in the event. */
  readonly paymentIdHint?: string;
  /** Provider-side payment id when the callback omits our own reference. */
  readonly providerPaymentIdHint?: string;
  readonly providerStatusRaw: string;
  /** Exact decimal strings; amounts move only from provider-confirmed values. */
  readonly paidAmount?: string;
  readonly paidCurrency?: string;
  readonly txid?: string;
  readonly finalizedAt?: Date;
  readonly eventTime?: Date;
}

/**
 * Normalized failure classes for every provider HTTP call (design §4.0).
 * The class drives health and retry behavior: `auth` fails the provider
 * closed immediately, `rate_limited` spends its backoff budget, `server` /
 * `timeout` retry with backoff, `client` maps straight to a problem.
 */
export const ProviderHttpErrorClasses = ['auth', 'client', 'server', 'rate_limited', 'timeout', 'network'] as const;

export type ProviderHttpErrorClass = (typeof ProviderHttpErrorClasses)[number];

export function isProviderHttpErrorClass(value: string): value is ProviderHttpErrorClass {
  return (ProviderHttpErrorClasses as readonly string[]).includes(value);
}

/**
 * The normalized error every adapter call funnels through (design §4.0, §5.1).
 *
 * `class` is the design's field name for the failure class; it is a plain
 * field rather than a parameter property because `class` is a reserved word
 * in that position.
 */
export class ProviderHttpError extends Error {
  readonly class: ProviderHttpErrorClass;
  readonly detail: string;
  readonly providerStatus?: number;
  readonly problemType?: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    errorClass: ProviderHttpErrorClass,
    detail: string,
    extras: { providerStatus?: number; problemType?: string; retryable: boolean; retryAfterSeconds?: number },
  ) {
    super(detail);
    this.name = 'ProviderHttpError';
    this.class = errorClass;
    this.detail = detail;
    this.providerStatus = extras.providerStatus;
    this.problemType = extras.problemType;
    this.retryable = extras.retryable;
    this.retryAfterSeconds = extras.retryAfterSeconds;
  }
}

export function isProviderHttpError(error: unknown): error is ProviderHttpError {
  return error instanceof ProviderHttpError;
}
