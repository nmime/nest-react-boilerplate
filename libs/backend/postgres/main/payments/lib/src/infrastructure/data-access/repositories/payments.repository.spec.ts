// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-001 REQ-PAYMENT-PROVIDER-005 REQ-PAYMENT-WEBHOOK-002
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentEntity,
  PaymentEventEntity,
  PaymentProviderEntity,
  PaymentProviderHealthEntity,
  PaymentRefundEntity,
  PaymentWebhookReceiptEntity,
} from '../entities';
import { PaymentsPostgresPersistence } from './payments.repository';

const paymentId = '123e4567-e89b-12d3-a456-426614174000';
const tenantId = '123e4567-e89b-12d3-a456-426614174001';

function payment(overrides: Partial<PaymentEntity> = {}): PaymentEntity {
  return Object.assign(
    new PaymentEntity({
      id: paymentId,
      tenantId,
      providerCode: 'stripe',
      amount: '10.00',
      currency: 'USD',
      meta: { name: 'Example' },
    }),
    overrides,
  );
}

function persistenceWith(entityManager: unknown): PaymentsPostgresPersistence {
  return new PaymentsPostgresPersistence(entityManager as EntityManager);
}

describe('PaymentsPostgresPersistence', () => {
  it('keeps the scaffold list/create/find surface mapped onto the real payment entity', async () => {
    const rows = [payment()];
    const persisted: unknown[] = [];
    const transaction = {
      persist: vi.fn((entity: unknown) => persisted.push(entity)),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      find: vi.fn().mockResolvedValue(rows),
      findOne: vi.fn().mockResolvedValue(rows[0]),
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const persistence = persistenceWith(entityManager);

    await expect(persistence.listPayments()).resolves.toEqual([
      { id: paymentId, name: 'Example', createdAt: rows[0]?.createdAt.toISOString() },
    ]);
    const created = await persistence.createPayment({ name: 'Created' });
    expect(created).toMatchObject({ name: 'Created' });
    expect(persisted).toEqual([expect.any(PaymentEntity), expect.any(PaymentEventEntity)]);
    await expect(persistence.findPayment(paymentId)).resolves.toMatchObject({ id: paymentId, name: 'Example' });
    entityManager.findOne.mockResolvedValueOnce(null);
    await expect(persistence.findPayment('missing')).resolves.toBeNull();
  });

  it('creates a payment and its created event atomically, then lists full records and events', async () => {
    const persisted: unknown[] = [];
    const created = payment();
    const event = new PaymentEventEntity({
      paymentId,
      type: 'created',
      toStatus: 'pending',
      actor: 'system',
    });
    event.id = '1';
    const transaction = {
      persist: vi.fn((entity: unknown) => persisted.push(entity)),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
      find: vi.fn().mockImplementation((entity: unknown) => {
        if (entity === PaymentEntity) {
          return Promise.resolve([created]);
        }
        if (entity === PaymentEventEntity) {
          return Promise.resolve([event]);
        }
        return Promise.resolve([]);
      }),
      findOne: vi.fn().mockResolvedValue(created),
    };
    const persistence = persistenceWith(entityManager);

    await expect(
      persistence.createPaymentRecord({
        id: paymentId,
        tenantId,
        providerCode: 'stripe',
        amount: '10.00',
        currency: 'USD',
      }),
    ).resolves.toMatchObject({ id: paymentId, status: 'pending', amount: '10.00' });
    expect(persisted).toEqual([expect.any(PaymentEntity), expect.any(PaymentEventEntity)]);
    expect(transaction.flush).toHaveBeenCalledTimes(2);
    await expect(persistence.listPaymentRecords(tenantId)).resolves.toHaveLength(1);
    await expect(persistence.findPaymentRecord(paymentId)).resolves.toMatchObject({ id: paymentId });
    await expect(persistence.findPaymentRecordByProviderReference('stripe', 'pi_1')).resolves.toMatchObject({
      id: paymentId,
    });
    await expect(persistence.listPaymentEvents(paymentId)).resolves.toMatchObject([{ id: 1, paymentId }]);
    entityManager.findOne.mockResolvedValueOnce(null);
    await expect(persistence.findPaymentRecord('missing')).resolves.toBeNull();
  });

  it('appends events and creates/lists refunds', async () => {
    const persisted: unknown[] = [];
    const refund = new PaymentRefundEntity({
      paymentId,
      amount: '10.00',
      currency: 'USD',
      status: 'confirmed',
      confirmedAt: new Date('2026-08-26T00:00:00.000Z'),
    });
    const entityManager = {
      persist: vi.fn((entity: unknown) => {
        persisted.push(entity);
        if (entity instanceof PaymentEventEntity) {
          entity.id = '2';
        }
      }),
      flush: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([refund]),
    };
    const persistence = persistenceWith(entityManager);

    await expect(
      persistence.appendPaymentEvent({ paymentId, type: 'provider_call', actor: 'system' }),
    ).resolves.toMatchObject({ id: 2, paymentId, type: 'provider_call' });
    await expect(
      persistence.createPaymentRefund({ paymentId, amount: '10.00', currency: 'USD', status: 'confirmed' }),
    ).resolves.toMatchObject({ paymentId, status: 'confirmed' });
    await expect(persistence.listPaymentRefunds(paymentId)).resolves.toHaveLength(1);
    expect(persisted).toEqual([expect.any(PaymentEventEntity), expect.any(PaymentRefundEntity)]);
  });

  it('upserts provider registry rows, applies tenant preference, and persists health', async () => {
    const platform = new PaymentProviderEntity({
      code: 'stripe',
      kind: 'fiat',
      baseUrl: 'https://platform.example',
      version: 'stripe-v1',
    });
    const tenant = new PaymentProviderEntity({
      code: 'stripe',
      kind: 'fiat',
      tenantId,
      baseUrl: 'https://tenant.example',
      version: 'stripe-v1',
    });
    const health = new PaymentProviderHealthEntity({ providerCode: 'stripe', state: 'unknown', consecutiveErrors: 0 });
    const findOne = vi.fn().mockImplementation((entity: unknown, where: { tenantId?: string | null }) => {
      if (entity === PaymentProviderEntity) {
        return Promise.resolve(where.tenantId === tenantId ? tenant : platform);
      }
      if (entity === PaymentProviderHealthEntity) {
        return Promise.resolve(health);
      }
      return Promise.resolve(null);
    });
    const entityManager = {
      find: vi.fn().mockResolvedValue([tenant, platform]),
      findOne,
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const persistence = persistenceWith(entityManager);

    await expect(persistence.listPaymentProviders(tenantId)).resolves.toHaveLength(2);
    await expect(persistence.findPaymentProvider('stripe', tenantId)).resolves.toMatchObject({
      tenantId,
      baseUrl: 'https://tenant.example',
    });
    await expect(
      persistence.upsertPaymentProvider({
        code: 'stripe',
        kind: 'fiat',
        baseUrl: 'https://updated.example',
        version: 'stripe-v1',
        priority: 10,
      }),
    ).resolves.toMatchObject({ baseUrl: 'https://updated.example', priority: 10 });
    await expect(persistence.findPaymentProviderHealth('stripe')).resolves.toMatchObject({ state: 'unknown' });
    await expect(
      persistence.upsertPaymentProviderHealth({
        providerCode: 'stripe',
        state: 'up',
        consecutiveErrors: 0,
        lastSuccessAt: new Date('2026-08-26T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ state: 'up' });
  });

  it('claims new, finalized, in-flight, and resumable receipts under an advisory and row lock', async () => {
    const fresh = new PaymentWebhookReceiptEntity({
      id: 'receipt-fresh',
      providerCode: 'stripe',
      idempotencyKey: 'evt_fresh',
      rawBody: '{}',
      signatureValid: 'valid',
      receivedAt: new Date('2026-08-26T00:00:10.000Z'),
    });
    const finalized = Object.assign(
      new PaymentWebhookReceiptEntity({
        id: 'receipt-final',
        providerCode: 'stripe',
        idempotencyKey: 'evt_final',
        rawBody: '{}',
        signatureValid: 'valid',
      }),
      { processingStatus: 'applied' as const },
    );
    const stale = Object.assign(
      new PaymentWebhookReceiptEntity({
        id: 'receipt-stale',
        providerCode: 'stripe',
        idempotencyKey: 'evt_stale',
        rawBody: '{}',
        signatureValid: 'valid',
        receivedAt: new Date('2026-08-26T00:00:00.000Z'),
      }),
      { processingStatus: 'error' as const, statusCode: 502, error: 'offline' },
    );
    const existing = [fresh, finalized, stale];
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'receipt-new' }])
      .mockResolvedValue([]);
    const transaction = {
      getConnection: vi.fn(() => ({ execute })),
      findOne: vi.fn(async () => existing.shift() ?? null),
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const persistence = persistenceWith(entityManager);
    const input = {
      providerCode: 'stripe',
      idempotencyKey: 'evt_1',
      rawBody: '{}',
      signatureValid: 'valid' as const,
      receivedAt: new Date('2026-08-26T00:00:10.000Z'),
    };
    const inflightBefore = new Date('2026-08-26T00:00:05.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(input.receivedAt);
    await expect(
      persistence.claimWebhookReceipt({ ...input, receivedAt: undefined }, inflightBefore),
    ).resolves.toMatchObject({ kind: 'claimed' });
    vi.useRealTimers();
    await expect(persistence.claimWebhookReceipt(input, inflightBefore)).resolves.toMatchObject({ kind: 'inflight' });
    await expect(persistence.claimWebhookReceipt(input, inflightBefore)).resolves.toMatchObject({ kind: 'finalized' });
    await expect(persistence.claimWebhookReceipt(input, inflightBefore)).resolves.toMatchObject({ kind: 'resumable' });
    expect(entityManager.transactional).toHaveBeenLastCalledWith(expect.any(Function), {
      propagation: 'required',
      isolationLevel: 'read committed',
      clear: true,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('on conflict ("provider_code", "idempotency_key") do nothing'),
      expect.arrayContaining(['stripe', 'evt_1', '{}', 'valid']),
      'all',
    );
    expect(transaction.findOne).toHaveBeenCalledWith(
      PaymentWebhookReceiptEntity,
      { providerCode: 'stripe', idempotencyKey: 'evt_1' },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(stale).toMatchObject({
      processingStatus: 'pending',
      statusCode: null,
      error: null,
      receivedAt: new Date('2026-08-26T00:00:00.000Z'),
      claimedAt: new Date('2026-08-26T00:00:10.000Z'),
      processedAt: null,
    });
  });

  it('inserts receipts and commits receipt-event-transition in one locked transaction', async () => {
    const row = payment({ status: 'processing' });
    const persisted: unknown[] = [];
    const transaction = {
      persist: vi.fn((entity: unknown) => {
        persisted.push(entity);
        if (entity instanceof PaymentEventEntity) {
          entity.id = '3';
        }
      }),
      flush: vi.fn().mockResolvedValue(undefined),
      findOne: vi.fn((entity: unknown) => Promise.resolve(entity === PaymentEntity ? row : null)),
    };
    const entityManager = {
      persist: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const persistence = persistenceWith(entityManager);
    const receipt = {
      providerCode: 'stripe',
      idempotencyKey: 'evt_1',
      rawBody: '{}',
      signatureValid: 'valid' as const,
    };

    await expect(persistence.insertWebhookReceipt(receipt)).resolves.toMatchObject({ processingStatus: 'pending' });
    const committed = await persistence.commitWebhookPaymentTransition({
      receipt,
      paymentId,
      toStatus: 'paid',
      actor: 'webhook',
      providerStatusRaw: 'succeeded',
      paidAmount: '10.00',
      paidCurrency: 'USD',
      providerEvidence: { providerStatusRaw: 'succeeded' },
      transitionedAt: new Date('2026-08-26T00:00:00.000Z'),
    });

    expect(transaction.findOne).toHaveBeenCalledWith(
      PaymentWebhookReceiptEntity,
      { id: undefined },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(transaction.findOne).toHaveBeenCalledWith(
      PaymentEntity,
      { id: paymentId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(transaction.flush).toHaveBeenCalledTimes(2);
    expect(persisted).toEqual([expect.any(PaymentWebhookReceiptEntity), expect.any(PaymentEventEntity)]);
    expect(committed).toMatchObject({
      receipt: { processingStatus: 'applied', statusCode: 200 },
      payment: { status: 'paid', paidAmount: '10.00', version: 2 },
      event: { id: 3, fromStatus: 'processing', toStatus: 'paid' },
    });
  });

  it('claims only terminal-money state changes with SKIP LOCKED and marks after publish', async () => {
    const event = new PaymentEventEntity({
      paymentId,
      type: 'state_change',
      fromStatus: 'processing',
      toStatus: 'paid',
      actor: 'webhook',
    });
    event.id = '4';
    const transaction = {
      find: vi.fn().mockResolvedValue([event]),
      flush: vi.fn().mockResolvedValue(undefined),
    };
    const entityManager = {
      transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const persistence = persistenceWith(entityManager);
    const publishedAt = new Date('2026-08-26T00:00:05.000Z');
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(persistence.claimPaymentOutbox({ count: 10, publishedAt }, publish)).resolves.toBe(1);
    expect(transaction.find).toHaveBeenCalledWith(
      PaymentEventEntity,
      {
        type: 'state_change',
        toStatus: { $in: ['paid', 'refunded'] },
        outboxPublishedAt: null,
      },
      expect.objectContaining({ lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE, limit: 10 }),
    );
    expect(publish).toHaveBeenCalledWith([expect.objectContaining({ id: 4, toStatus: 'paid' })]);
    expect(event.outboxPublishedAt).toEqual(publishedAt);
    expect(transaction.flush).toHaveBeenCalledOnce();
  });
});
