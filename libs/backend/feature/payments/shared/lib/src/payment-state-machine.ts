import { isTerminalPaymentStatus, type PaymentStatus } from './payment.types';

/**
 * The payment state machine (design §2.1).
 *
 * `transitionPayment` is the single pure function every mutator funnels
 * through — webhook, reconciler, admin — so all three enforce the invariants
 * identically. Same input, same verdict, no I/O: the persistence boundary
 * writes the returned event draft in the same transaction as the status
 * update (invariant 1) and appends the escalation event when one is returned
 * (invariant 8).
 *
 * Creation is the entry, not a transition: a new payment is born `pending`
 * (design §2.1 first row).
 */

/** Every legal edge (design §2.1 table). */
export const PaymentTransitionEdges = [
  ['pending', 'processing'],
  ['pending', 'paid'],
  ['pending', 'failed'],
  ['pending', 'cancelled'],
  ['pending', 'expired'],
  ['processing', 'paid'],
  ['processing', 'failed'],
  ['processing', 'cancelled'],
  ['processing', 'expired'],
  ['paid', 'refunded'],
] as const satisfies readonly [PaymentStatus, PaymentStatus][];

export function isLegalPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PaymentTransitionEdges.some(([a, b]) => a === from && b === to);
}

/**
 * Everything a mutator knows about the provider state that motivated a
 * transition. The `paid` transition is only allowed with `recheckedAt` — the
 * double-check rule (invariant 2): no provider webhook, signed or not, moves
 * a payment to `paid` without a provider-API re-check; for the signed fiat
 * webhooks the re-fetch must additionally match the webhook's amount
 * (mismatch → no transition + P1, enforced at the webhook boundary).
 */
export interface PaymentTransitionEvidence {
  /** The raw provider status string (audit). */
  readonly providerStatusRaw: string;
  /** When the provider-API re-check ran; required for a `paid` transition (invariant 2). */
  readonly recheckedAt?: Date;
  /** The provider's finality marker (X-Rocket finalizedAt, …) when it carries one. */
  readonly finalizedAt?: Date;
  /** Provider-confirmed realized amounts, exact decimal strings (invariant 4). */
  readonly paidAmount?: string;
  readonly paidCurrency?: string;
  readonly fee?: string;
  readonly txid?: string;
  /** The underpaid amount, exact decimal string (invariant 5). */
  readonly partialAmount?: string;
  /** The full-refund confirmation, exact decimal string (invariant 7). */
  readonly refundAmount?: string;
  readonly refundCurrency?: string;
  /** A failure sub-reason (e.g. 'aml_hold' for a Heleket AML hold). */
  readonly subReason?: string;
  /** The caller's free-form reason (manual status, reconciliation note). */
  readonly reason?: string;
}

export type PaymentTransitionRejectReason =
  'same-status' | 'illegal-transition' | 'paid-requires-provider-recheck' | 'refund-requires-confirmation';

/** The `payment_events` row the caller writes in the same transaction (invariant 1). */
export interface PaymentStateChangeEventDraft {
  readonly type: 'state_change';
  readonly fromStatus: PaymentStatus;
  readonly toStatus: PaymentStatus;
  readonly providerEvidence: Record<string, unknown>;
}

/**
 * Invariant 8: the provider reports paid on a payment already closed
 * (`failed`, `cancelled`, `expired`, or `refunded`). The machine never
 * auto-credits it — the caller appends the reconcile event, raises a P1
 * alert, and the operator refunds manually (double-spend / refund-owed guard).
 */
export interface LatePaymentEscalation {
  readonly reason: 'late_payment_after_close';
  /** The event to append: type 'reconcile', reason 'late_payment_after_close'. */
  readonly event: {
    readonly type: 'reconcile';
    readonly reason: 'late_payment_after_close';
    readonly providerEvidence: Record<string, unknown>;
  };
}

export interface PaymentTransitionResult {
  /** False for the no-op and every rejected edge — a rejected transition never moves the payment. */
  readonly applied: boolean;
  readonly from: PaymentStatus;
  /** The unchanged `from` when rejected; the new status when applied. */
  readonly to: PaymentStatus;
  readonly reason?: PaymentTransitionRejectReason;
  readonly event?: PaymentStateChangeEventDraft;
  readonly escalation?: LatePaymentEscalation;
}

function evidenceToProviderEvidence(evidence: PaymentTransitionEvidence): Record<string, unknown> {
  const out: Record<string, unknown> = { providerStatusRaw: evidence.providerStatusRaw };

  const put = (key: string, value: string | Date | undefined): void => {
    if (value !== undefined) {
      out[key] = value instanceof Date ? value.toISOString() : value;
    }
  };

  put('recheckedAt', evidence.recheckedAt);
  put('finalizedAt', evidence.finalizedAt);
  put('paidAmount', evidence.paidAmount);
  put('paidCurrency', evidence.paidCurrency);
  put('fee', evidence.fee);
  put('txid', evidence.txid);
  put('partialAmount', evidence.partialAmount);
  put('refundAmount', evidence.refundAmount);
  put('refundCurrency', evidence.refundCurrency);
  put('subReason', evidence.subReason);
  put('reason', evidence.reason);

  return out;
}

/**
 * The one transition function (design §2.1 invariants).
 *
 * - Invariant 6: a transition is idempotent — `current == next` (or an
 *   illegal edge) is a pure no-op `{ applied: false, reason }`, so webhook
 *   redelivery, reconciler races, and retry storms never double-credit or
 *   double-log state.
 * - Invariant 8: a paid report on a closed payment escalates instead of
 *   transitioning.
 * - Invariant 2: `paid` without a provider-API re-check is refused on every
 *   path.
 * - Invariant 7: `refunded` only from `paid`, on a confirmed full refund.
 */
export function transitionPayment(
  current: PaymentStatus,
  next: PaymentStatus,
  evidence: PaymentTransitionEvidence,
): PaymentTransitionResult {
  const rejected = (reason: PaymentTransitionRejectReason): PaymentTransitionResult => ({
    applied: false,
    from: current,
    to: current,
    reason,
  });

  if (current === next) {
    return rejected('same-status');
  }

  const providerEvidence = evidenceToProviderEvidence(evidence);

  if (next === 'paid' && isTerminalPaymentStatus(current)) {
    return {
      applied: false,
      from: current,
      to: current,
      reason: 'illegal-transition',
      escalation: {
        reason: 'late_payment_after_close',
        event: { type: 'reconcile', reason: 'late_payment_after_close', providerEvidence },
      },
    };
  }

  if (!isLegalPaymentTransition(current, next)) {
    return rejected('illegal-transition');
  }

  if (next === 'paid' && !(evidence.recheckedAt instanceof Date)) {
    return rejected('paid-requires-provider-recheck');
  }

  if (next === 'refunded' && (evidence.refundAmount === undefined || evidence.refundCurrency === undefined)) {
    return rejected('refund-requires-confirmation');
  }

  return {
    applied: true,
    from: current,
    to: next,
    event: { type: 'state_change', fromStatus: current, toStatus: next, providerEvidence },
  };
}

/**
 * What payment status a provider status — known or unknown — implies for a
 * non-terminal payment (design §2.1, invariants 3 and 5):
 *
 * - `underpaid` stays in flight as `processing` (invariant 5: underpaid never
 *   auto-`paid`; at expiry it dies `expired`, or `failed` by admin choice);
 * - `aml_hold` fails the payment (the caller passes `subReason: 'aml_hold'`);
 * - anything unrecognized maps to `processing`, never `paid` (invariant 3).
 *
 * A terminal current status is returned unchanged: terminal states leave only
 * through {@link transitionPayment}, and this mapping never proposes an exit.
 */
export function paymentStatusForProviderStatus(providerStatus: string, current: PaymentStatus): PaymentStatus {
  if (isTerminalPaymentStatus(current)) {
    return current;
  }

  switch (providerStatus) {
    case 'paid':
      return 'paid';
    case 'failed':
    case 'aml_hold':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'pending':
      return 'pending';
    case 'processing':
    case 'underpaid':
    default:
      return 'processing';
  }
}
