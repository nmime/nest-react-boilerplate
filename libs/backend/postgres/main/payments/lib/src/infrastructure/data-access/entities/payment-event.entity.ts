import { EntitySchema } from '@mikro-orm/core';
import type { CreatePaymentEventParams, PaymentEventType, PaymentStatus } from '@app/backend-feature-payments-shared';

export class PaymentEventEntity {
  id!: string;
  paymentId!: string;
  type!: PaymentEventType;
  fromStatus: PaymentStatus | null = null;
  toStatus: PaymentStatus | null = null;
  actor!: string;
  reason: string | null = null;
  providerEvidence: Record<string, unknown> | null = null;
  requestId: string | null = null;
  outboxPublishedAt: Date | null = null;
  createdAt: Date = new Date();

  constructor(input?: CreatePaymentEventParams) {
    if (!input) {
      return;
    }
    this.paymentId = input.paymentId;
    this.type = input.type;
    this.fromStatus = input.fromStatus ?? null;
    this.toStatus = input.toStatus ?? null;
    this.actor = input.actor;
    this.reason = input.reason ?? null;
    this.providerEvidence = input.providerEvidence ?? null;
    this.requestId = input.requestId ?? null;
    this.createdAt = input.createdAt ?? new Date();
  }
}

export const PaymentEventEntitySchema = new EntitySchema<PaymentEventEntity>({
  class: PaymentEventEntity,
  tableName: 'payment_events',
  properties: {
    id: { type: 'bigint', primary: true, autoincrement: true },
    paymentId: { type: 'uuid', fieldName: 'payment_id' },
    type: { type: 'text' },
    fromStatus: { type: 'text', fieldName: 'from_status', nullable: true },
    toStatus: { type: 'text', fieldName: 'to_status', nullable: true },
    actor: { type: 'text' },
    reason: { type: 'text', nullable: true },
    providerEvidence: { type: 'json', fieldName: 'provider_evidence', nullable: true },
    requestId: { type: 'text', fieldName: 'request_id', nullable: true },
    outboxPublishedAt: { type: 'timestamptz', fieldName: 'outbox_published_at', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
});
