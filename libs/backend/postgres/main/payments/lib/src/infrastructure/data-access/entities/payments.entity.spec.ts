// @requirements REQ-PAYMENT-ORDER-004 REQ-PAYMENT-WEBHOOK-002
import { describe, expect, it } from 'vitest';
import {
  PaymentEntity,
  PaymentEntitySchema,
  PaymentEventEntity,
  PaymentEventEntitySchema,
  PaymentProviderEntity,
  PaymentProviderEntitySchema,
  PaymentProviderHealthEntity,
  PaymentProviderHealthEntitySchema,
  PaymentRefundEntity,
  PaymentRefundEntitySchema,
  PaymentWebhookReceiptEntity,
  PaymentWebhookReceiptEntitySchema,
} from './index';

const paymentInput = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  tenantId: '123e4567-e89b-12d3-a456-426614174001',
  providerCode: 'stripe',
  amount: '10.00',
  currency: 'USD',
} as const;

const invokeHook = (hook: unknown): unknown => (hook as (() => unknown) | undefined)?.();

describe('payments PostgreSQL entities', () => {
  it('constructs a payment with exact-string money and pending defaults', () => {
    const payment = new PaymentEntity(paymentInput);

    expect(payment).toMatchObject({
      ...paymentInput,
      status: 'pending',
      refundedAmount: '0',
      meta: {},
      version: 1,
    });
    expect(payment.createdAt).toBeInstanceOf(Date);
    expect(payment.updatedAt).toEqual(payment.createdAt);
  });

  it('constructs every persistence aggregate and maps it to the design table', () => {
    const provider = new PaymentProviderEntity({
      code: 'stripe',
      kind: 'fiat',
      baseUrl: 'https://pay.example',
      version: 'stripe-v1',
    });
    const event = new PaymentEventEntity({
      paymentId: paymentInput.id,
      type: 'state_change',
      fromStatus: 'processing',
      toStatus: 'paid',
      actor: 'webhook',
    });
    const receipt = new PaymentWebhookReceiptEntity({
      providerCode: 'stripe',
      idempotencyKey: 'evt_1',
      rawBody: '{}',
      signatureValid: 'valid',
    });
    const refund = new PaymentRefundEntity({
      paymentId: paymentInput.id,
      amount: '10.00',
      currency: 'USD',
      status: 'requested',
    });
    const health = new PaymentProviderHealthEntity({
      providerCode: 'stripe',
      state: 'up',
      consecutiveErrors: 0,
    });

    expect(provider).toMatchObject({ code: 'stripe', enabled: false, priority: 100, timeoutMs: 15_000 });
    expect(event).toMatchObject({ type: 'state_change', outboxPublishedAt: null });
    expect(receipt).toMatchObject({ processingStatus: 'pending', providerCode: 'stripe' });
    expect(refund).toMatchObject({ status: 'requested', providerRefundId: null });
    expect(health).toMatchObject({ state: 'up', consecutiveErrors: 0 });
    expect([
      PaymentProviderEntitySchema.meta.tableName,
      PaymentEntitySchema.meta.tableName,
      PaymentEventEntitySchema.meta.tableName,
      PaymentWebhookReceiptEntitySchema.meta.tableName,
      PaymentRefundEntitySchema.meta.tableName,
      PaymentProviderHealthEntitySchema.meta.tableName,
    ]).toEqual([
      'payment_providers',
      'payments',
      'payment_events',
      'payment_webhook_receipts',
      'payment_refunds',
      'payment_provider_health',
    ]);
  });

  it('exposes all timestamp lifecycle hooks required by the real tables', () => {
    for (const schema of [
      PaymentProviderEntitySchema,
      PaymentEntitySchema,
      PaymentEventEntitySchema,
      PaymentWebhookReceiptEntitySchema,
      PaymentRefundEntitySchema,
      PaymentProviderHealthEntitySchema,
    ]) {
      schema.init();
    }

    expect(invokeHook(PaymentProviderEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentProviderEntitySchema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentEntitySchema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentEventEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentWebhookReceiptEntitySchema.meta.properties.receivedAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentRefundEntitySchema.meta.properties.createdAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentProviderHealthEntitySchema.meta.properties.updatedAt.onUpdate)).toBeInstanceOf(Date);
  });

  it('allows empty construction for MikroORM hydration', () => {
    expect(new PaymentProviderEntity()).toBeInstanceOf(PaymentProviderEntity);
    expect(new PaymentEntity()).toBeInstanceOf(PaymentEntity);
    expect(new PaymentEventEntity()).toBeInstanceOf(PaymentEventEntity);
    expect(new PaymentWebhookReceiptEntity()).toBeInstanceOf(PaymentWebhookReceiptEntity);
    expect(new PaymentRefundEntity()).toBeInstanceOf(PaymentRefundEntity);
    expect(new PaymentProviderHealthEntity()).toBeInstanceOf(PaymentProviderHealthEntity);
  });
});
