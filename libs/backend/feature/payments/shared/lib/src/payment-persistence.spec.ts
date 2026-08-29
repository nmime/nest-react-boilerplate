// @requirements REQ-PAYMENT-ORDER-001 REQ-PAYMENT-ORDER-003
import { describe, expect, it } from 'vitest';
import {
  type ClaimPaymentOutboxParams,
  type CommitWebhookPaymentTransitionParams,
  type CommittedWebhookPaymentTransition,
  type CreatePaymentEventParams,
  type CreatePaymentRecordParams,
  type CreatePaymentRefundParams,
  type CreatePaymentsDto,
  type CreatePaymentWebhookReceiptParams,
  type PaymentEventRecord,
  type PaymentOutboxPublisher,
  type PaymentProviderHealthRecord,
  type PaymentProviderRecord,
  type PaymentRecord,
  type PaymentRefundRecord,
  type PaymentsDto,
  PaymentsPersistence,
  type PaymentWebhookReceiptClaimOutcome,
  type PaymentWebhookReceiptRecord,
  type UpdatePaymentWebhookReceiptParams,
  type UpsertPaymentProviderHealthParams,
  type UpsertPaymentProviderParams,
} from './index';

class InMemoryPaymentsPersistence extends PaymentsPersistence {
  private readonly scaffold = new Map<string, PaymentsDto>();
  private readonly records = new Map<string, PaymentRecord>();
  private readonly events: PaymentEventRecord[] = [];

  override async listPayments(): Promise<PaymentsDto[]> {
    return [...this.scaffold.values()];
  }

  override async createPayment(input: CreatePaymentsDto): Promise<PaymentsDto> {
    const dto = { id: 'payment-1', name: input.name, createdAt: '2026-08-26T00:00:00.000Z' };
    this.scaffold.set(dto.id, dto);
    return dto;
  }

  override async findPayment(id: string): Promise<PaymentsDto | null> {
    return this.scaffold.get(id) ?? null;
  }

  override async listPaymentRecords(tenantId: string): Promise<PaymentRecord[]> {
    return [...this.records.values()].filter((payment) => payment.tenantId === tenantId);
  }

  override async createPaymentRecord(input: CreatePaymentRecordParams): Promise<PaymentRecord> {
    const createdAt = input.createdAt ?? new Date('2026-08-26T00:00:00.000Z');
    const record: PaymentRecord = {
      id: input.id,
      tenantId: input.tenantId,
      providerCode: input.providerCode,
      providerPaymentId: input.providerPaymentId ?? null,
      status: input.status ?? 'pending',
      amount: input.amount,
      currency: input.currency,
      fxSnapshot: input.fxSnapshot ?? null,
      providerStatusRaw: input.providerStatusRaw ?? null,
      paidAmount: input.paidAmount ?? null,
      paidCurrency: input.paidCurrency ?? null,
      fee: input.fee ?? null,
      partialAmount: input.partialAmount ?? null,
      refundedAmount: input.refundedAmount ?? '0',
      meta: input.meta ?? {},
      expiresAt: input.expiresAt ?? null,
      createdAt,
      updatedAt: createdAt,
      paidAt: null,
      cancelledAt: null,
      expiredAt: null,
      refundedAt: null,
      version: 1,
    };
    this.records.set(record.id, record);
    return record;
  }

  override async findPaymentRecord(id: string): Promise<PaymentRecord | null> {
    return this.records.get(id) ?? null;
  }

  override async findPaymentRecordByProviderReference(
    providerCode: string,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null> {
    return (
      [...this.records.values()].find(
        (record) => record.providerCode === providerCode && record.providerPaymentId === providerPaymentId,
      ) ?? null
    );
  }

  override async appendPaymentEvent(input: CreatePaymentEventParams): Promise<PaymentEventRecord> {
    const event: PaymentEventRecord = {
      id: this.events.length + 1,
      paymentId: input.paymentId,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actor: input.actor,
      reason: input.reason ?? null,
      providerEvidence: input.providerEvidence ?? null,
      requestId: input.requestId ?? null,
      outboxPublishedAt: null,
      createdAt: input.createdAt ?? new Date(),
    };
    this.events.push(event);
    return event;
  }

  override async listPaymentEvents(paymentId: string): Promise<PaymentEventRecord[]> {
    return this.events.filter((event) => event.paymentId === paymentId);
  }

  override async listPaymentProviders(): Promise<PaymentProviderRecord[]> {
    return [];
  }
  override async findPaymentProvider(): Promise<PaymentProviderRecord | null> {
    return null;
  }
  override async upsertPaymentProvider(_input: UpsertPaymentProviderParams): Promise<PaymentProviderRecord> {
    throw new Error('not needed by port-shape test');
  }
  override async findPaymentProviderHealth(): Promise<PaymentProviderHealthRecord | null> {
    return null;
  }
  override async upsertPaymentProviderHealth(
    _input: UpsertPaymentProviderHealthParams,
  ): Promise<PaymentProviderHealthRecord> {
    throw new Error('not needed by port-shape test');
  }
  override async findWebhookReceipt(): Promise<PaymentWebhookReceiptRecord | null> {
    return null;
  }
  override async claimWebhookReceipt(): Promise<PaymentWebhookReceiptClaimOutcome> {
    throw new Error('not needed by port-shape test');
  }
  override async insertWebhookReceipt(_input: CreatePaymentWebhookReceiptParams): Promise<PaymentWebhookReceiptRecord> {
    throw new Error('not needed by port-shape test');
  }
  override async updateWebhookReceipt(
    _id: string,
    _input: UpdatePaymentWebhookReceiptParams,
  ): Promise<PaymentWebhookReceiptRecord> {
    throw new Error('not needed by port-shape test');
  }
  override async commitWebhookPaymentTransition(
    _input: CommitWebhookPaymentTransitionParams,
  ): Promise<CommittedWebhookPaymentTransition> {
    throw new Error('not needed by port-shape test');
  }
  override async createPaymentRefund(_input: CreatePaymentRefundParams): Promise<PaymentRefundRecord> {
    throw new Error('not needed by port-shape test');
  }
  override async listPaymentRefunds(): Promise<PaymentRefundRecord[]> {
    return [];
  }
  override async claimPaymentOutbox(
    _params: ClaimPaymentOutboxParams,
    _publish: PaymentOutboxPublisher,
  ): Promise<number> {
    return 0;
  }
}

describe('PaymentsPersistence port', () => {
  it('is an abstract token that axes bind implementations to', () => {
    const persistence: PaymentsPersistence = new InMemoryPaymentsPersistence();
    expect(persistence).toBeInstanceOf(PaymentsPersistence);
  });

  it('round-trips scaffold and full payment records without exposing entities', async () => {
    const persistence = new InMemoryPaymentsPersistence();
    const scaffold = await persistence.createPayment({ name: 'Example' });
    const record = await persistence.createPaymentRecord({
      id: 'payment-1',
      tenantId: 'tenant-1',
      providerCode: 'stripe',
      amount: '10.00',
      currency: 'USD',
    });
    await persistence.appendPaymentEvent({ paymentId: record.id, type: 'created', actor: 'system' });

    await expect(persistence.listPayments()).resolves.toEqual([scaffold]);
    await expect(persistence.findPayment(scaffold.id)).resolves.toEqual(scaffold);
    await expect(persistence.listPaymentRecords('tenant-1')).resolves.toEqual([record]);
    await expect(persistence.findPaymentRecord(record.id)).resolves.toEqual(record);
    await expect(persistence.listPaymentEvents(record.id)).resolves.toHaveLength(1);
  });
});
