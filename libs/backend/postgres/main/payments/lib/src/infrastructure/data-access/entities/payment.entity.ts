import { EntitySchema } from '@mikro-orm/core';
import type { CreatePaymentRecordParams, FxSnapshot, PaymentStatus } from '@app/backend-feature-payments-shared';
import type { CurrencyCode } from '@app/common-money';

export class PaymentEntity {
  id!: string;
  tenantId!: string;
  providerCode!: string;
  providerPaymentId: string | null = null;
  status: PaymentStatus = 'pending';
  amount!: string;
  currency!: CurrencyCode;
  fxSnapshot: FxSnapshot | null = null;
  providerStatusRaw: string | null = null;
  paidAmount: string | null = null;
  paidCurrency: string | null = null;
  fee: string | null = null;
  partialAmount: string | null = null;
  refundedAmount = '0';
  meta: Record<string, unknown> = {};
  expiresAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
  paidAt: Date | null = null;
  cancelledAt: Date | null = null;
  expiredAt: Date | null = null;
  refundedAt: Date | null = null;
  version = 1;

  constructor(input?: CreatePaymentRecordParams) {
    if (!input) {
      return;
    }
    this.id = input.id;
    this.tenantId = input.tenantId;
    this.providerCode = input.providerCode;
    this.providerPaymentId = input.providerPaymentId ?? null;
    this.status = input.status ?? 'pending';
    this.amount = input.amount;
    this.currency = input.currency;
    this.fxSnapshot = input.fxSnapshot ?? null;
    this.providerStatusRaw = input.providerStatusRaw ?? null;
    this.paidAmount = input.paidAmount ?? null;
    this.paidCurrency = input.paidCurrency ?? null;
    this.fee = input.fee ?? null;
    this.partialAmount = input.partialAmount ?? null;
    this.refundedAmount = input.refundedAmount ?? '0';
    this.meta = input.meta ?? {};
    this.expiresAt = input.expiresAt ?? null;
    this.createdAt = input.createdAt ?? new Date();
    this.updatedAt = this.createdAt;
  }
}

export const PaymentEntitySchema = new EntitySchema<PaymentEntity>({
  class: PaymentEntity,
  tableName: 'payments',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id' },
    providerCode: { type: 'text', fieldName: 'provider_code' },
    providerPaymentId: { type: 'text', fieldName: 'provider_payment_id', nullable: true },
    status: { type: 'text' },
    amount: { type: 'text' },
    currency: { type: 'text' },
    fxSnapshot: { type: 'json', fieldName: 'fx_snapshot', nullable: true },
    providerStatusRaw: { type: 'text', fieldName: 'provider_status_raw', nullable: true },
    paidAmount: { type: 'text', fieldName: 'paid_amount', nullable: true },
    paidCurrency: { type: 'text', fieldName: 'paid_currency', nullable: true },
    fee: { type: 'text', nullable: true },
    partialAmount: { type: 'text', fieldName: 'partial_amount', nullable: true },
    refundedAmount: { type: 'text', fieldName: 'refunded_amount', default: '0' },
    meta: { type: 'json', defaultRaw: "'{}'::jsonb" },
    expiresAt: { type: 'timestamptz', fieldName: 'expires_at', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
    paidAt: { type: 'timestamptz', fieldName: 'paid_at', nullable: true },
    cancelledAt: { type: 'timestamptz', fieldName: 'cancelled_at', nullable: true },
    expiredAt: { type: 'timestamptz', fieldName: 'expired_at', nullable: true },
    refundedAt: { type: 'timestamptz', fieldName: 'refunded_at', nullable: true },
    version: { type: 'integer', default: 1 },
  },
});
