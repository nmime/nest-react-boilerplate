import type {
  FxSnapshot,
  PaymentEventType,
  PaymentProviderErrorClass,
  PaymentProviderHealthState,
  PaymentProviderKind,
  PaymentProviderSupportedCurrency,
  PaymentRefundStatus,
  PaymentStatus,
  PaymentWebhookProcessingStatus,
  PaymentWebhookSignatureValidity,
} from '@app/backend-feature-payments-shared';
import type { CurrencyCode } from '@app/common-money';

export interface PaymentDocument {
  _id: string;
  tenantId: string;
  providerCode: string;
  providerPaymentId: string | null;
  status: PaymentStatus;
  amount: string;
  currency: CurrencyCode;
  fxSnapshot: FxSnapshot | null;
  providerStatusRaw: string | null;
  paidAmount: string | null;
  paidCurrency: string | null;
  fee: string | null;
  partialAmount: string | null;
  refundedAmount: string;
  meta: Record<string, unknown>;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  expiredAt: Date | null;
  refundedAt: Date | null;
  version: number;
}

export interface PaymentEventDocument {
  _id: string;
  paymentId: string;
  type: PaymentEventType;
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus | null;
  actor: string;
  reason: string | null;
  providerEvidence: Record<string, unknown> | null;
  requestId: string | null;
  outboxPublishedAt: Date | null;
  createdAt: Date;
}

export interface PaymentWebhookReceiptDocument {
  _id: string;
  providerCode: string;
  idempotencyKey: string;
  rawBody: string;
  contentType: string | null;
  signatureValid: PaymentWebhookSignatureValidity;
  signatureKind: string | null;
  statusCode: number | null;
  processingStatus: PaymentWebhookProcessingStatus;
  error: string | null;
  requestId: string | null;
  receivedAt: Date;
  claimedAt: Date;
  processedAt: Date | null;
}

export interface PaymentProviderDocument {
  _id: string;
  code: string;
  kind: PaymentProviderKind;
  enabled: boolean;
  priority: number;
  tenantId: string | null;
  supportedCurrencies: readonly PaymentProviderSupportedCurrency[];
  config: Record<string, unknown>;
  baseUrl: string;
  version: string;
  credentialsEncrypted: Record<string, unknown> | null;
  timeoutMs: number;
  regionAllow: readonly string[] | null;
  regionDeny: readonly string[];
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface PaymentRefundDocument {
  _id: string;
  paymentId: string;
  providerRefundId: string | null;
  amount: string;
  currency: CurrencyCode;
  status: PaymentRefundStatus;
  initiatedBy: string | null;
  providerEvidence: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface PaymentProviderHealthDocument {
  _id: string;
  state: PaymentProviderHealthState;
  consecutiveErrors: number;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorClass: PaymentProviderErrorClass | null;
  updatedAt: Date;
}
