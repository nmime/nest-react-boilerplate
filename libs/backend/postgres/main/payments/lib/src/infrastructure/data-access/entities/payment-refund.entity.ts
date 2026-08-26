import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { CreatePaymentRefundParams, PaymentRefundStatus } from '@app/backend-feature-payments-shared';
import type { CurrencyCode } from '@app/common-money';

export class PaymentRefundEntity {
  id: string = randomUUID();
  paymentId!: string;
  providerRefundId: string | null = null;
  amount!: string;
  currency!: CurrencyCode;
  status!: PaymentRefundStatus;
  initiatedBy: string | null = null;
  providerEvidence: Record<string, unknown> | null = null;
  reason: string | null = null;
  createdAt: Date = new Date();
  confirmedAt: Date | null = null;

  constructor(input?: CreatePaymentRefundParams) {
    if (!input) {
      return;
    }
    this.id = input.id ?? randomUUID();
    this.paymentId = input.paymentId;
    this.providerRefundId = input.providerRefundId ?? null;
    this.amount = input.amount;
    this.currency = input.currency;
    this.status = input.status;
    this.initiatedBy = input.initiatedBy ?? null;
    this.providerEvidence = input.providerEvidence ?? null;
    this.reason = input.reason ?? null;
    this.createdAt = input.createdAt ?? new Date();
    this.confirmedAt = input.confirmedAt ?? null;
  }
}

export const PaymentRefundEntitySchema = new EntitySchema<PaymentRefundEntity>({
  class: PaymentRefundEntity,
  tableName: 'payment_refunds',
  properties: {
    id: { type: 'uuid', primary: true },
    paymentId: { type: 'uuid', fieldName: 'payment_id' },
    providerRefundId: { type: 'text', fieldName: 'provider_refund_id', nullable: true },
    amount: { type: 'text' },
    currency: { type: 'text' },
    status: { type: 'text' },
    initiatedBy: { type: 'text', fieldName: 'initiated_by', nullable: true },
    providerEvidence: { type: 'json', fieldName: 'provider_evidence', nullable: true },
    reason: { type: 'text', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    confirmedAt: { type: 'timestamptz', fieldName: 'confirmed_at', nullable: true },
  },
});
