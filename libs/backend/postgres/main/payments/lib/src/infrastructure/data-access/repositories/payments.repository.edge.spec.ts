// @requirements REQ-PAYMENT-PROVIDER-001 REQ-PAYMENT-PROVIDER-005 REQ-PAYMENT-WEBHOOK-002
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentEntity,
  PaymentEventEntity,
  PaymentProviderEntity,
  PaymentProviderHealthEntity,
  PaymentWebhookReceiptEntity,
} from '../entities';
import { PaymentsPostgresPersistence } from './payments.repository';

const paymentId = '123e4567-e89b-12d3-a456-426614174000';
const tenantId = '123e4567-e89b-12d3-a456-426614174001';

function persistenceWith(entityManager: unknown): PaymentsPostgresPersistence {
  return new PaymentsPostgresPersistence(entityManager as EntityManager);
}

function payment(status: PaymentEntity['status']): PaymentEntity {
  return Object.assign(
    new PaymentEntity({
      id: paymentId,
      tenantId,
      providerCode: 'stripe',
      amount: '10.00',
      currency: 'USD',
    }),
    { status },
  );
}

const receipt = {
  providerCode: 'stripe',
  idempotencyKey: 'evt_edge',
  rawBody: '{}',
  signatureValid: 'valid' as const,
};

describe('PaymentsPostgresPersistence edge paths', () => {
  it('falls back to the payment id when the scaffold name is absent', async () => {
    const row = payment('pending');
    const persistence = persistenceWith({
      find: vi.fn().mockResolvedValue([row]),
      findOne: vi.fn().mockResolvedValue(row),
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    });

    await expect(persistence.listPayments()).resolves.toMatchObject([{ id: paymentId, name: paymentId }]);
    const event = await persistence.appendPaymentEvent({ paymentId, type: 'provider_call', actor: 'system' });
    expect(event).toMatchObject({ paymentId });
    expect(event.id).toBeUndefined();
  });

  it('uses the platform provider when no tenant row exists and returns null when neither exists', async () => {
    const platform = new PaymentProviderEntity({
      code: 'stripe',
      kind: 'fiat',
      baseUrl: 'https://platform.example',
      version: 'stripe-v1',
    });
    const findOne = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(platform).mockResolvedValueOnce(null);
    const persistence = persistenceWith({ findOne });

    await expect(persistence.findPaymentProvider('stripe', tenantId)).resolves.toMatchObject({ tenantId: null });
    await expect(persistence.findPaymentProvider('missing')).resolves.toBeNull();
  });

  it('inserts new provider and health rows and preserves explicit optional values', async () => {
    const persist = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const persistence = persistenceWith({
      findOne: vi.fn().mockResolvedValue(null),
      persist,
      flush,
    });

    await expect(
      persistence.upsertPaymentProvider({
        code: 'stripe',
        kind: 'fiat',
        enabled: true,
        priority: 5,
        baseUrl: 'https://pay.example',
        version: 'stripe-v1',
        credentialsEncrypted: { keyId: 'k1' },
        timeoutMs: 5_000,
        regionAllow: ['US'],
        regionDeny: ['RU'],
        updatedBy: tenantId,
      }),
    ).resolves.toMatchObject({ enabled: true, priority: 5, timeoutMs: 5_000, regionAllow: ['US'] });
    await expect(
      persistence.upsertPaymentProviderHealth({
        providerCode: 'stripe',
        state: 'down',
        consecutiveErrors: 5,
        lastErrorAt: new Date('2026-08-26T00:00:00.000Z'),
        lastErrorClass: 'auth',
        updatedAt: new Date('2026-08-26T00:00:01.000Z'),
      }),
    ).resolves.toMatchObject({ state: 'down', lastErrorClass: 'auth' });
    expect(persist).toHaveBeenCalledWith(expect.any(PaymentProviderEntity));
    expect(persist).toHaveBeenCalledWith(expect.any(PaymentProviderHealthEntity));
  });

  it('preserves defaults while updating existing provider and health rows', async () => {
    const provider = new PaymentProviderEntity({
      code: 'stripe',
      kind: 'fiat',
      baseUrl: 'https://old.example',
      version: 'stripe-v1',
    });
    const health = new PaymentProviderHealthEntity({ providerCode: 'stripe', state: 'up', consecutiveErrors: 0 });
    const findOne = vi.fn().mockResolvedValueOnce(provider).mockResolvedValueOnce(health).mockResolvedValueOnce(null);
    const persistence = persistenceWith({
      findOne,
      find: vi.fn().mockResolvedValue([]),
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      persistence.upsertPaymentProvider({
        code: 'stripe',
        kind: 'fiat',
        baseUrl: 'https://new.example',
        version: 'stripe-v1',
      }),
    ).resolves.toMatchObject({ priority: 100, baseUrl: 'https://new.example' });
    await expect(
      persistence.upsertPaymentProviderHealth({
        providerCode: 'stripe',
        state: 'degraded',
        consecutiveErrors: 2,
      }),
    ).resolves.toMatchObject({ state: 'degraded', lastSuccessAt: null });
    await expect(persistence.findPaymentProviderHealth('missing')).resolves.toBeNull();
    await expect(persistence.listPaymentProviders()).resolves.toEqual([]);
  });

  it('rejects a claim when a conflict winner cannot be observed', async () => {
    const transaction = {
      getConnection: vi.fn(() => ({ execute: vi.fn().mockResolvedValue([]) })),
      findOne: vi.fn().mockResolvedValue(null),
    };
    const persistence = persistenceWith({
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    });

    await expect(
      persistence.claimWebhookReceipt(
        { providerCode: 'stripe', idempotencyKey: 'evt_missing', rawBody: '{}', signatureValid: 'valid' },
        new Date(),
      ),
    ).rejects.toThrow('Webhook receipt conflict winner is not visible.');
  });

  it('finds and updates webhook receipts, including nullable terminal metadata', async () => {
    const row = new PaymentWebhookReceiptEntity({ ...receipt, id: 'receipt-edge' });
    const missing = persistenceWith({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(missing.findWebhookReceipt('stripe', 'missing')).resolves.toBeNull();
    await expect(missing.findPaymentRecordByProviderReference('stripe', 'missing')).resolves.toBeNull();
    await expect(missing.updateWebhookReceipt('missing', { processingStatus: 'error' })).rejects.toThrow(
      'Webhook receipt missing does not exist.',
    );

    const persistence = persistenceWith({
      findOne: vi.fn().mockResolvedValue(row),
      flush: vi.fn().mockResolvedValue(undefined),
    });
    await expect(persistence.findWebhookReceipt('stripe', 'evt_edge')).resolves.toMatchObject({ id: 'receipt-edge' });
    await expect(
      persistence.updateWebhookReceipt('receipt-edge', {
        processingStatus: 'ignored',
        statusCode: null,
        error: null,
        processedAt: null,
      }),
    ).resolves.toMatchObject({ processingStatus: 'ignored', statusCode: null, error: null, processedAt: null });
    await expect(persistence.updateWebhookReceipt('receipt-edge', {})).resolves.toMatchObject({
      processingStatus: 'ignored',
    });
  });

  it.each([
    ['cancelled', 'cancelledAt'],
    ['expired', 'expiredAt'],
    ['refunded', 'refundedAt'],
    ['failed', 'paidAt'],
  ] as const)('sets %s terminal timestamp during an atomic transition', async (toStatus, timestampField) => {
    const row = payment('processing');
    const transaction = {
      persist: vi.fn((entity: unknown) => {
        if (entity instanceof PaymentEventEntity) {
          entity.id = '8';
        }
      }),
      flush: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn().mockResolvedValue(row),
    };
    const persistence = persistenceWith({
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    });

    const committed = await persistence.commitWebhookPaymentTransition({
      receipt: { ...receipt, idempotencyKey: `evt_${toStatus}` },
      paymentId,
      toStatus,
      actor: 'webhook',
      transitionedAt: new Date('2026-08-26T00:00:02.000Z'),
      refundedAmount: toStatus === 'refunded' ? '10.00' : undefined,
    });

    expect(committed.payment[timestampField]).toEqual(
      toStatus === 'failed' ? null : new Date('2026-08-26T00:00:02.000Z'),
    );
  });

  it('uses transition defaults when optional receipt and event fields are absent', async () => {
    const row = payment('processing');
    const transaction = {
      persist: vi.fn((entity: unknown) => {
        if (entity instanceof PaymentEventEntity) {
          entity.id = '9';
        }
      }),
      flush: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn().mockResolvedValue(row),
    };
    const persistence = persistenceWith({
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    });

    const before = Date.now();
    const committed = await persistence.commitWebhookPaymentTransition({
      receipt,
      paymentId,
      toStatus: 'paid',
      actor: 'webhook',
    });

    expect(committed.receipt.statusCode).toBe(200);
    expect(committed.event.reason).toBeNull();
    expect(committed.event.providerEvidence).toBeNull();
    expect(committed.event.requestId).toBeNull();
    expect(committed.payment.paidAt?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('rejects a transition for a missing payment and returns zero when the outbox is empty', async () => {
    const transitionTx = {
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn().mockResolvedValue(null),
    };
    const emptyOutboxTx = { find: vi.fn().mockResolvedValue([]), flush: vi.fn() };
    const transactional = vi
      .fn()
      .mockImplementationOnce(async (callback: (em: typeof transitionTx) => Promise<unknown>) => callback(transitionTx))
      .mockImplementationOnce(async (callback: (em: typeof emptyOutboxTx) => Promise<unknown>) =>
        callback(emptyOutboxTx),
      );
    const persistence = persistenceWith({ transactional });

    await expect(
      persistence.commitWebhookPaymentTransition({ receipt, paymentId, toStatus: 'paid', actor: 'webhook' }),
    ).rejects.toThrow(`Payment ${paymentId} does not exist.`);
    await expect(
      persistence.claimPaymentOutbox({ count: 10, publishedAt: new Date('2026-08-26T00:00:03.000Z') }, vi.fn()),
    ).resolves.toBe(0);
  });
});
