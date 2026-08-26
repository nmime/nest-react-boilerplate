import type { CurrencyCode } from '@app/common-money';
import type { FxSnapshot } from './fx-snapshot';

/**
 * The seven payment lifecycle states (design §2.1).
 *
 * `pending` is the entry state: a payment is born `pending` the moment
 * `createPayment` succeeds (provider invoice id stored) and no state machine
 * transition precedes it.
 */
export const PaymentStatuses = ['pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded'] as const;

export type PaymentStatus = (typeof PaymentStatuses)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PaymentStatuses as readonly string[]).includes(value);
}

/** States a payment can never leave once reached (design §2.1). */
export const TerminalPaymentStatuses = ['paid', 'failed', 'cancelled', 'expired', 'refunded'] as const;

export type TerminalPaymentStatus = (typeof TerminalPaymentStatuses)[number];

export function isTerminalPaymentStatus(value: PaymentStatus): value is TerminalPaymentStatus {
  return (TerminalPaymentStatuses as readonly string[]).includes(value);
}

/** The `payment_events.type` CHECK values (design §3.1). */
export const PaymentEventTypes = [
  'created',
  'state_change',
  'webhook_received',
  'provider_call',
  'reconcile',
  'refund',
  'manual_override',
] as const;

export type PaymentEventType = (typeof PaymentEventTypes)[number];

export function isPaymentEventType(value: string): value is PaymentEventType {
  return (PaymentEventTypes as readonly string[]).includes(value);
}

/**
 * An append-only `payment_events` row (design §3.1).
 *
 * Rows are never updated or deleted; the outbox advances only
 * `outboxPublishedAt` after publishing a `state_change` to a terminal money
 * state. `providerEvidence` carries provider-confirmed values only (invariant
 * 4): the raw status, txid, finality marker, realized amounts.
 */
export interface PaymentEventRecord {
  /** Postgres bigserial; absent until the row is persisted. */
  readonly id?: number;
  readonly paymentId: string;
  readonly type: PaymentEventType;
  readonly fromStatus: PaymentStatus | null;
  readonly toStatus: PaymentStatus | null;
  /** 'system' | 'webhook' | 'reconciler' | 'admin:<id>'. */
  readonly actor: string;
  readonly reason: string | null;
  readonly providerEvidence: Record<string, unknown> | null;
  /** CLS requestId; joins to the problem `instance`. */
  readonly requestId: string | null;
  /** Set by the outbox worker after publishing; null until then. */
  readonly outboxPublishedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * A payment as feature code sees it (design §3.1 `payments`).
 *
 * Amounts are decimal strings end to end — the only place they meet
 * arithmetic is `payment-money.ts` (invariant 4). `id` doubles as the
 * clientInvoiceId / order_id / Idempotence-Key sent to every provider
 * (REQ-PAYMENT-ORDER-003).
 */
export interface PaymentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly providerCode: string;
  readonly providerPaymentId: string | null;
  readonly status: PaymentStatus;
  readonly amount: string;
  readonly currency: CurrencyCode;
  /** Written at creation and never mutated (invariant 9). */
  readonly fxSnapshot: FxSnapshot | null;
  /** Last provider status string (audit). */
  readonly providerStatusRaw: string | null;
  /** Provider-realized net values, captured at `paid` (design §2.3). */
  readonly paidAmount: string | null;
  readonly paidCurrency: string | null;
  readonly fee: string | null;
  /** Underpaid tracking (invariant 5). */
  readonly partialAmount: string | null;
  readonly refundedAmount: string;
  /** orderRef and friends. */
  readonly meta: Record<string, unknown>;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly expiredAt: Date | null;
  readonly refundedAt: Date | null;
  /** Optimistic lock. */
  readonly version: number;
}

// ---------------------------------------------------------------------------
// U1 scaffold surface — replaced by the U9 customer view DTOs. Kept so the
// generated main / postgres / admin scaffold code compiles until U9 lands.
// ---------------------------------------------------------------------------

export interface PaymentsDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreatePaymentsDto {
  name: string;
}

export const PaymentsReadPermission = 'payments:read';
export const PaymentsWritePermission = 'payments:write';
