import type { CurrencyCode } from '@app/common-money';
import type { FxSnapshot } from './fx-snapshot';
import type {
  CreatePaymentsDto,
  PaymentEventRecord,
  PaymentEventType,
  PaymentRecord,
  PaymentStatus,
  PaymentsDto,
} from './payment.types';

export type PaymentProviderKind = 'crypto' | 'fiat';
export type PaymentProviderHealthState = 'unknown' | 'up' | 'degraded' | 'down' | 'disabled';
export type PaymentProviderErrorClass = 'auth' | 'client' | 'server' | 'rate_limited' | 'timeout' | 'network';
export type PaymentWebhookSignatureValidity = 'valid' | 'invalid' | 'none';
export type PaymentWebhookProcessingStatus = 'pending' | 'applied' | 'ignored' | 'rejected' | 'error';
export type PaymentRefundStatus = 'requested' | 'confirmed' | 'failed' | 'manual';

export interface PaymentProviderSupportedCurrency {
  readonly code: string;
  readonly kind: PaymentProviderKind;
  readonly networks?: readonly string[];
}

export interface PaymentProviderRecord {
  readonly id: string;
  readonly code: string;
  readonly kind: PaymentProviderKind;
  readonly enabled: boolean;
  readonly priority: number;
  readonly tenantId: string | null;
  readonly supportedCurrencies: readonly PaymentProviderSupportedCurrency[];
  readonly config: Record<string, unknown>;
  readonly baseUrl: string;
  readonly version: string;
  readonly credentialsEncrypted: Record<string, unknown> | null;
  readonly timeoutMs: number;
  readonly regionAllow: readonly string[] | null;
  readonly regionDeny: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;
}

export interface UpsertPaymentProviderParams {
  readonly id?: string;
  readonly code: string;
  readonly kind: PaymentProviderKind;
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly tenantId?: string | null;
  readonly supportedCurrencies?: readonly PaymentProviderSupportedCurrency[];
  readonly config?: Record<string, unknown>;
  readonly baseUrl: string;
  readonly version: string;
  readonly credentialsEncrypted?: Record<string, unknown> | null;
  readonly timeoutMs?: number;
  readonly regionAllow?: readonly string[] | null;
  readonly regionDeny?: readonly string[];
  readonly updatedBy?: string | null;
}

export interface PaymentProviderHealthRecord {
  readonly providerCode: string;
  readonly state: PaymentProviderHealthState;
  readonly consecutiveErrors: number;
  readonly lastSuccessAt: Date | null;
  readonly lastErrorAt: Date | null;
  readonly lastErrorClass: PaymentProviderErrorClass | null;
  readonly updatedAt: Date;
}

export interface UpsertPaymentProviderHealthParams {
  readonly providerCode: string;
  readonly state: PaymentProviderHealthState;
  readonly consecutiveErrors: number;
  readonly lastSuccessAt?: Date | null;
  readonly lastErrorAt?: Date | null;
  readonly lastErrorClass?: PaymentProviderErrorClass | null;
  readonly updatedAt?: Date;
}

export interface CreatePaymentRecordParams {
  readonly id: string;
  readonly tenantId: string;
  readonly providerCode: string;
  readonly providerPaymentId?: string | null;
  readonly status?: PaymentStatus;
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly fxSnapshot?: FxSnapshot | null;
  readonly providerStatusRaw?: string | null;
  readonly paidAmount?: string | null;
  readonly paidCurrency?: string | null;
  readonly fee?: string | null;
  readonly partialAmount?: string | null;
  readonly refundedAmount?: string;
  readonly meta?: Record<string, unknown>;
  readonly expiresAt?: Date | null;
  readonly createdAt?: Date;
}

export interface CreatePaymentEventParams {
  readonly paymentId: string;
  readonly type: PaymentEventType;
  readonly fromStatus?: PaymentStatus | null;
  readonly toStatus?: PaymentStatus | null;
  readonly actor: string;
  readonly reason?: string | null;
  readonly providerEvidence?: Record<string, unknown> | null;
  readonly requestId?: string | null;
  readonly createdAt?: Date;
}

export interface PaymentWebhookReceiptRecord {
  readonly id: string;
  readonly providerCode: string;
  readonly idempotencyKey: string;
  readonly rawBody: string;
  readonly contentType: string | null;
  readonly signatureValid: PaymentWebhookSignatureValidity;
  readonly signatureKind: string | null;
  readonly statusCode: number | null;
  readonly processingStatus: PaymentWebhookProcessingStatus;
  readonly error: string | null;
  readonly requestId: string | null;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
}

export interface CreatePaymentWebhookReceiptParams {
  readonly id?: string;
  readonly providerCode: string;
  readonly idempotencyKey: string;
  readonly rawBody: string;
  readonly contentType?: string | null;
  readonly signatureValid: PaymentWebhookSignatureValidity;
  readonly signatureKind?: string | null;
  readonly statusCode?: number | null;
  readonly processingStatus?: PaymentWebhookProcessingStatus;
  readonly error?: string | null;
  readonly requestId?: string | null;
  readonly receivedAt?: Date;
  readonly processedAt?: Date | null;
}

export interface CommitWebhookPaymentTransitionParams {
  readonly receipt: CreatePaymentWebhookReceiptParams;
  readonly paymentId: string;
  readonly toStatus: PaymentStatus;
  readonly actor: string;
  readonly reason?: string | null;
  readonly providerEvidence?: Record<string, unknown> | null;
  readonly requestId?: string | null;
  readonly statusCode?: number;
  readonly transitionedAt?: Date;
  readonly providerStatusRaw?: string | null;
  readonly paidAmount?: string | null;
  readonly paidCurrency?: string | null;
  readonly fee?: string | null;
  readonly partialAmount?: string | null;
  readonly refundedAmount?: string;
}

export interface CommittedWebhookPaymentTransition {
  readonly receipt: PaymentWebhookReceiptRecord;
  readonly payment: PaymentRecord;
  readonly event: PaymentEventRecord;
}

export interface PaymentRefundRecord {
  readonly id: string;
  readonly paymentId: string;
  readonly providerRefundId: string | null;
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly status: PaymentRefundStatus;
  readonly initiatedBy: string | null;
  readonly providerEvidence: Record<string, unknown> | null;
  readonly reason: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
}

export interface CreatePaymentRefundParams {
  readonly id?: string;
  readonly paymentId: string;
  readonly providerRefundId?: string | null;
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly status: PaymentRefundStatus;
  readonly initiatedBy?: string | null;
  readonly providerEvidence?: Record<string, unknown> | null;
  readonly reason?: string | null;
  readonly createdAt?: Date;
  readonly confirmedAt?: Date | null;
}

export interface ClaimPaymentOutboxParams {
  readonly count: number;
  readonly publishedAt: Date;
}

export type PaymentOutboxPublisher = (events: readonly PaymentEventRecord[]) => Promise<void>;

/**
 * Persistence boundary for payments.
 *
 * Implementations own transactions, entity mapping, and the receipt-first-then-transition write
 * order, so the same service runs on the Postgres and MongoDB axes without a branch. Feature code
 * must never depend on database entities directly — that is what lets the setup tool swap the axis
 * without touching feature code.
 */
export abstract class PaymentsPersistence {
  // U1 scaffold surface. U9 replaces these methods with customer view queries.
  abstract listPayments(): Promise<PaymentsDto[]>;
  abstract createPayment(input: CreatePaymentsDto): Promise<PaymentsDto>;
  abstract findPayment(id: string): Promise<PaymentsDto | null>;

  abstract listPaymentRecords(tenantId: string): Promise<PaymentRecord[]>;
  abstract createPaymentRecord(input: CreatePaymentRecordParams): Promise<PaymentRecord>;
  abstract findPaymentRecord(id: string): Promise<PaymentRecord | null>;
  abstract appendPaymentEvent(input: CreatePaymentEventParams): Promise<PaymentEventRecord>;
  abstract listPaymentEvents(paymentId: string): Promise<PaymentEventRecord[]>;

  abstract listPaymentProviders(tenantId?: string): Promise<PaymentProviderRecord[]>;
  abstract findPaymentProvider(code: string, tenantId?: string): Promise<PaymentProviderRecord | null>;
  abstract upsertPaymentProvider(input: UpsertPaymentProviderParams): Promise<PaymentProviderRecord>;

  abstract findPaymentProviderHealth(providerCode: string): Promise<PaymentProviderHealthRecord | null>;
  abstract upsertPaymentProviderHealth(input: UpsertPaymentProviderHealthParams): Promise<PaymentProviderHealthRecord>;

  abstract insertWebhookReceipt(input: CreatePaymentWebhookReceiptParams): Promise<PaymentWebhookReceiptRecord>;
  abstract commitWebhookPaymentTransition(
    input: CommitWebhookPaymentTransitionParams,
  ): Promise<CommittedWebhookPaymentTransition>;

  abstract createPaymentRefund(input: CreatePaymentRefundParams): Promise<PaymentRefundRecord>;
  abstract listPaymentRefunds(paymentId: string): Promise<PaymentRefundRecord[]>;

  /**
   * Locks unpublished paid/refunded state-change events with `SKIP LOCKED`, calls the publisher
   * while those locks are held, then marks the rows published in the same transaction. Publishing
   * before the mark deliberately gives at-least-once delivery if the final database write fails.
   */
  abstract claimPaymentOutbox(params: ClaimPaymentOutboxParams, publish: PaymentOutboxPublisher): Promise<number>;
}
