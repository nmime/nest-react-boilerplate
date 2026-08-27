// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-001 REQ-PAYMENT-PROVIDER-005 REQ-PAYMENT-WEBHOOK-002
import type { CurrencyCode } from '@app/common-money';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsMongoPersistence } from './payments-mongo.repository';

const paymentId = '123e4567-e89b-12d3-a456-426614174000';
const tenantId = '123e4567-e89b-12d3-a456-426614174001';
const now = new Date('2026-08-26T00:00:00.000Z');

function cursor(rows: unknown[]) {
  return { toArray: vi.fn().mockResolvedValue(rows) };
}

function collection(overrides: Record<string, unknown> = {}) {
  return {
    find: vi.fn(() => cursor([])),
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    replaceOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    ...overrides,
  };
}

function persistenceWith(collections: Record<string, ReturnType<typeof collection>>) {
  return new PaymentsMongoPersistence({ collection: vi.fn((name: string) => collections[name]) } as never);
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    _id: paymentId,
    tenantId,
    providerCode: 'stripe',
    providerPaymentId: 'pi_1',
    status: 'processing',
    amount: '10.00',
    currency: 'USD' as CurrencyCode,
    fxSnapshot: null,
    providerStatusRaw: null,
    paidAmount: null,
    paidCurrency: null,
    fee: null,
    partialAmount: null,
    refundedAmount: '0',
    meta: { name: 'Example' },
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    cancelledAt: null,
    expiredAt: null,
    refundedAt: null,
    version: 1,
    ...overrides,
  };
}

function allCollections(overrides: Record<string, ReturnType<typeof collection>> = {}) {
  return {
    payments: collection(),
    payment_events: collection(),
    payment_webhook_receipts: collection(),
    payment_providers: collection(),
    payment_refunds: collection(),
    payment_provider_health: collection(),
    ...overrides,
  };
}

describe('PaymentsMongoPersistence', () => {
  it('maps scaffold and full payment queries, including missing rows', async () => {
    const row = payment();
    const payments = collection({
      find: vi.fn(() => cursor([row])),
      findOne: vi
        .fn()
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(null),
    });
    const persistence = persistenceWith(allCollections({ payments }));

    await expect(persistence.listPayments()).resolves.toEqual([
      { id: paymentId, name: 'Example', createdAt: now.toISOString() },
    ]);
    await expect(persistence.findPayment(paymentId)).resolves.toMatchObject({ id: paymentId, name: 'Example' });
    await expect(persistence.findPayment('missing')).resolves.toBeNull();
    await expect(persistence.listPaymentRecords(tenantId)).resolves.toMatchObject([
      { id: paymentId, status: 'processing' },
    ]);
    await expect(persistence.findPaymentRecord(paymentId)).resolves.toMatchObject({ id: paymentId });
    await expect(persistence.findPaymentRecord('missing')).resolves.toBeNull();
  });

  it('creates a payment followed by its deterministic created event', async () => {
    const payments = collection();
    const events = collection();
    const persistence = persistenceWith(allCollections({ payments, payment_events: events }));

    const record = await persistence.createPaymentRecord({
      id: paymentId,
      tenantId,
      providerCode: 'stripe',
      amount: '10.00',
      currency: 'USD',
      createdAt: now,
    });

    expect(payments.insertOne).toHaveBeenCalledWith(expect.objectContaining({ _id: paymentId, status: 'pending' }));
    expect(events.updateOne).toHaveBeenCalledWith(
      { _id: `${paymentId}:created` },
      { $setOnInsert: expect.objectContaining({ paymentId, type: 'created', toStatus: 'pending' }) },
      { upsert: true },
    );
    expect(record).toMatchObject({ id: paymentId, refundedAmount: '0', version: 1 });

    const scaffold = await persistence.createPayment({ name: 'Created' });
    expect(scaffold).toMatchObject({ name: 'Created' });
    expect(scaffold.id).toEqual(expect.any(String));
  });

  it('appends and lists events and creates and lists refunds', async () => {
    const event = {
      _id: 'event-1',
      paymentId,
      type: 'provider_call',
      fromStatus: null,
      toStatus: null,
      actor: 'system',
      reason: null,
      providerEvidence: null,
      requestId: null,
      outboxPublishedAt: null,
      createdAt: now,
    };
    const refund = {
      _id: 'refund-1',
      paymentId,
      providerRefundId: null,
      amount: '10.00',
      currency: 'USD' as CurrencyCode,
      status: 'confirmed',
      initiatedBy: null,
      providerEvidence: null,
      reason: null,
      createdAt: now,
      confirmedAt: now,
    };
    const events = collection({ find: vi.fn(() => cursor([event])) });
    const refunds = collection({ find: vi.fn(() => cursor([refund])) });
    const persistence = persistenceWith(allCollections({ payment_events: events, payment_refunds: refunds }));

    await expect(
      persistence.appendPaymentEvent({ paymentId, type: 'provider_call', actor: 'system', createdAt: now }),
    ).resolves.toMatchObject({ paymentId, type: 'provider_call' });
    await expect(persistence.listPaymentEvents(paymentId)).resolves.toEqual([expect.objectContaining({ paymentId })]);
    await expect(
      persistence.createPaymentRefund({
        id: 'refund-new',
        paymentId,
        amount: '10.00',
        currency: 'USD',
        status: 'confirmed',
        confirmedAt: now,
        createdAt: now,
      }),
    ).resolves.toMatchObject({ id: 'refund-new', status: 'confirmed' });
    await expect(persistence.listPaymentRefunds(paymentId)).resolves.toHaveLength(1);
  });

  it('upserts providers, prefers tenant shadowing, and maps provider health', async () => {
    const platform = {
      _id: 'provider-platform',
      code: 'stripe',
      kind: 'fiat',
      enabled: true,
      priority: 20,
      tenantId: null,
      supportedCurrencies: [],
      config: {},
      baseUrl: 'https://platform.example',
      version: 'v1',
      credentialsEncrypted: {},
      timeoutMs: 15_000,
      regionAllow: null,
      regionDeny: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: null,
    };
    const tenant = { ...platform, _id: 'provider-tenant', tenantId, baseUrl: 'https://tenant.example' };
    const providers = collection({
      find: vi.fn(() => cursor([tenant, platform])),
      findOne: vi
        .fn()
        .mockResolvedValueOnce(tenant)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(platform)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(platform)
        .mockResolvedValueOnce(null),
    });
    const healthRow = {
      _id: 'stripe',
      state: 'unknown',
      consecutiveErrors: 0,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorClass: null,
      updatedAt: now,
    };
    const health = collection({
      findOne: vi
        .fn()
        .mockResolvedValueOnce(healthRow)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(healthRow)
        .mockResolvedValueOnce(null),
    });
    const persistence = persistenceWith(
      allCollections({ payment_providers: providers, payment_provider_health: health }),
    );

    await expect(persistence.listPaymentProviders(tenantId)).resolves.toHaveLength(2);
    await expect(persistence.findPaymentProvider('stripe', tenantId)).resolves.toMatchObject({ tenantId });
    await expect(persistence.findPaymentProvider('stripe', 'other')).resolves.toMatchObject({ tenantId: null });
    await expect(persistence.findPaymentProvider('missing')).resolves.toBeNull();
    await expect(
      persistence.upsertPaymentProvider({
        code: 'stripe',
        kind: 'fiat',
        baseUrl: 'https://updated.example',
        version: 'v2',
        priority: 10,
      }),
    ).resolves.toMatchObject({ id: 'provider-platform', priority: 10, version: 'v2' });
    await expect(
      persistence.upsertPaymentProvider({ code: 'new', kind: 'crypto', baseUrl: 'https://new.example', version: 'v1' }),
    ).resolves.toMatchObject({ code: 'new', enabled: false, timeoutMs: 15_000 });
    await expect(persistence.findPaymentProviderHealth('stripe')).resolves.toMatchObject({ state: 'unknown' });
    await expect(persistence.findPaymentProviderHealth('missing')).resolves.toBeNull();
    await expect(
      persistence.upsertPaymentProviderHealth({ providerCode: 'stripe', state: 'up', consecutiveErrors: 0 }),
    ).resolves.toMatchObject({ state: 'up' });
    await expect(
      persistence.upsertPaymentProviderHealth({ providerCode: 'new', state: 'down', consecutiveErrors: 3 }),
    ).resolves.toMatchObject({ state: 'down', lastErrorAt: null });
  });

  it('uses generated defaults and explicit optional provider and health fields', async () => {
    const fallbackPayment = payment({ meta: {} });
    const payments = collection({ find: vi.fn(() => cursor([fallbackPayment])) });
    const events = collection();
    const providers = collection({
      find: vi.fn(() => cursor([])),
      findOne: vi.fn().mockResolvedValue({
        _id: 'provider-platform',
        code: 'stripe',
        kind: 'fiat',
        enabled: true,
        priority: 20,
        tenantId: null,
        supportedCurrencies: [],
        config: {},
        baseUrl: 'https://platform.example',
        version: 'v1',
        credentialsEncrypted: {},
        timeoutMs: 15_000,
        regionAllow: null,
        regionDeny: [],
        createdAt: now,
        updatedAt: now,
        updatedBy: null,
      }),
    });
    const health = collection({
      findOne: vi.fn().mockResolvedValue({
        _id: 'stripe',
        state: 'degraded',
        consecutiveErrors: 1,
        lastSuccessAt: null,
        lastErrorAt: now,
        lastErrorClass: 'server',
        updatedAt: now,
      }),
    });
    const refunds = collection();
    const persistence = persistenceWith(
      allCollections({
        payments,
        payment_events: events,
        payment_providers: providers,
        payment_provider_health: health,
        payment_refunds: refunds,
      }),
    );

    await expect(persistence.listPayments()).resolves.toEqual([
      { id: paymentId, name: paymentId, createdAt: now.toISOString() },
    ]);
    await expect(
      persistence.appendPaymentEvent({ paymentId, type: 'provider_call', actor: 'system' }),
    ).resolves.toMatchObject({ createdAt: expect.any(Date) });
    await expect(persistence.listPaymentProviders()).resolves.toEqual([]);
    await expect(
      persistence.upsertPaymentProvider({
        code: 'stripe',
        kind: 'fiat',
        baseUrl: 'https://updated.example',
        version: 'v2',
        credentialsEncrypted: null,
        regionAllow: ['US'],
        updatedBy: 'admin-1',
      }),
    ).resolves.toMatchObject({ credentialsEncrypted: null, regionAllow: ['US'], updatedBy: 'admin-1' });
    await expect(
      persistence.upsertPaymentProviderHealth({
        providerCode: 'stripe',
        state: 'up',
        consecutiveErrors: 0,
        lastSuccessAt: now,
        lastErrorAt: null,
        lastErrorClass: null,
      }),
    ).resolves.toMatchObject({ lastSuccessAt: now, lastErrorAt: null, lastErrorClass: null });
    await expect(
      persistence.createPaymentRefund({ paymentId, amount: '1.00', currency: 'USD', status: 'requested' }),
    ).resolves.toMatchObject({ id: expect.any(String), createdAt: expect.any(Date), confirmedAt: null });
  });

  it('inserts a standalone webhook receipt', async () => {
    const receipts = collection();
    const persistence = persistenceWith(allCollections({ payment_webhook_receipts: receipts }));

    await expect(
      persistence.insertWebhookReceipt({
        id: 'receipt-1',
        providerCode: 'stripe',
        idempotencyKey: 'evt_1',
        rawBody: '{}',
        signatureValid: 'valid',
        receivedAt: now,
      }),
    ).resolves.toMatchObject({ id: 'receipt-1', processingStatus: 'pending' });
    expect(receipts.insertOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'receipt-1' }));
  });

  it.each([
    ['paid', 'paidAt'],
    ['cancelled', 'cancelledAt'],
    ['expired', 'expiredAt'],
    ['refunded', 'refundedAt'],
    ['failed', undefined],
  ] as const)('commits receipt-event-payment in order for %s', async (toStatus, timestampField) => {
    const before = payment();
    const after = payment({ status: toStatus, version: 2, ...(timestampField ? { [timestampField]: now } : {}) });
    const receipt = {
      _id: 'receipt-1',
      providerCode: 'stripe',
      idempotencyKey: 'evt_1',
      rawBody: '{}',
      contentType: null,
      signatureValid: 'valid',
      signatureKind: null,
      statusCode: 200,
      processingStatus: 'applied',
      error: null,
      requestId: null,
      receivedAt: now,
      processedAt: now,
    };
    const event = {
      _id: 'receipt-1:state_change',
      paymentId,
      type: 'state_change',
      fromStatus: 'processing',
      toStatus,
      actor: 'webhook',
      reason: null,
      providerEvidence: null,
      requestId: null,
      outboxPublishedAt: null,
      createdAt: now,
    };
    const calls: string[] = [];
    const receipts = collection({
      insertOne: vi.fn(async () => {
        calls.push('receipt');
        return { acknowledged: true };
      }),
      updateOne: vi.fn(async () => {
        calls.push('receipt-applied');
        return { matchedCount: 1, modifiedCount: 1 };
      }),
      findOne: vi.fn().mockResolvedValue(receipt),
    });
    const events = collection({
      updateOne: vi.fn(async () => {
        calls.push('event');
        return { matchedCount: 1, modifiedCount: 1 };
      }),
      findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(event),
    });
    const payments = collection({
      findOne: vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
      updateOne: vi.fn(async () => {
        calls.push('payment');
        return { matchedCount: 1, modifiedCount: 1 };
      }),
    });
    const collections = allCollections({ payments, payment_events: events, payment_webhook_receipts: receipts });
    const persistence = new PaymentsMongoPersistence(
      { collection: vi.fn((name: keyof typeof collections) => collections[name]) } as never,
      {
        after: vi.fn((stage: string) => {
          calls.push(`after-${stage}`);
        }),
      },
    );

    const committed = await persistence.commitWebhookPaymentTransition({
      receipt: {
        id: 'receipt-1',
        providerCode: 'stripe',
        idempotencyKey: 'evt_1',
        rawBody: '{}',
        signatureValid: 'valid',
        receivedAt: now,
      },
      paymentId,
      toStatus,
      actor: 'webhook',
      transitionedAt: now,
    });

    expect(calls).toEqual([
      'receipt',
      'after-receipt',
      'event',
      'after-event',
      'payment',
      'after-payment',
      'receipt-applied',
    ]);
    expect(payments.updateOne).toHaveBeenCalledWith(
      { _id: paymentId, version: 1, status: 'processing' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: toStatus, ...(timestampField ? { [timestampField]: now } : {}) }),
        $inc: { version: 1 },
      }),
    );
    expect(committed).toMatchObject({
      payment: { status: toStatus, version: 2 },
      receipt: { processingStatus: 'applied' },
    });
  });

  it('recovers a duplicate pending receipt and an already-applied payment without repeating the update', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    const existingReceipt = {
      _id: 'receipt-1',
      providerCode: 'stripe',
      idempotencyKey: 'evt_1',
      rawBody: '{}',
      contentType: null,
      signatureValid: 'valid',
      signatureKind: null,
      statusCode: null,
      processingStatus: 'pending',
      error: null,
      requestId: null,
      receivedAt: now,
      processedAt: null,
    };
    const appliedReceipt = { ...existingReceipt, processingStatus: 'applied', statusCode: 200, processedAt: now };
    const event = {
      _id: 'receipt-1:state_change',
      paymentId,
      type: 'state_change',
      fromStatus: 'processing',
      toStatus: 'paid',
      actor: 'webhook',
      reason: null,
      providerEvidence: null,
      requestId: null,
      outboxPublishedAt: null,
      createdAt: now,
    };
    const receipts = collection({
      insertOne: vi.fn().mockRejectedValue(duplicate),
      findOne: vi.fn().mockResolvedValueOnce(existingReceipt).mockResolvedValueOnce(appliedReceipt),
    });
    const payments = collection({ findOne: vi.fn().mockResolvedValue(payment({ status: 'paid', version: 2 })) });
    const events = collection({ findOne: vi.fn().mockResolvedValue(event) });
    const persistence = persistenceWith(
      allCollections({ payments, payment_events: events, payment_webhook_receipts: receipts }),
    );

    await expect(
      persistence.commitWebhookPaymentTransition({
        receipt: {
          providerCode: 'stripe',
          idempotencyKey: 'evt_1',
          rawBody: '{}',
          signatureValid: 'valid',
        },
        paymentId,
        toStatus: 'paid',
        actor: 'webhook',
        transitionedAt: now,
      }),
    ).resolves.toMatchObject({ payment: { status: 'paid', version: 2 } });
    expect(payments.updateOne).not.toHaveBeenCalled();
  });

  it('rejects a recovery event that belongs to another transition', async () => {
    const existingEvent = {
      _id: 'receipt-1:state_change',
      paymentId: 'another-payment',
      type: 'state_change',
      fromStatus: 'processing',
      toStatus: 'paid',
      actor: 'webhook',
      reason: null,
      providerEvidence: null,
      requestId: null,
      outboxPublishedAt: null,
      createdAt: now,
    };
    const events = collection({ findOne: vi.fn().mockResolvedValue(existingEvent) });
    const payments = collection({ findOne: vi.fn().mockResolvedValue(payment()) });
    const persistence = persistenceWith(allCollections({ payments, payment_events: events }));

    await expect(
      persistence.commitWebhookPaymentTransition({
        receipt: { providerCode: 'stripe', idempotencyKey: 'evt_conflict', rawBody: '{}', signatureValid: 'valid' },
        paymentId,
        toStatus: 'paid',
        actor: 'webhook',
      }),
    ).rejects.toThrow('conflicts with an existing recovery event');
  });

  it.each([
    ['non-duplicate receipt failure', Object.assign(new Error('offline'), { code: 91 }), 'offline'],
    ['duplicate with missing winner', Object.assign(new Error('duplicate'), { code: 11000 }), 'duplicate'],
  ])('propagates %s', async (_label, error, message) => {
    const receipts = collection({
      insertOne: vi.fn().mockRejectedValue(error),
      findOne: vi.fn().mockResolvedValue(null),
    });
    const persistence = persistenceWith(allCollections({ payment_webhook_receipts: receipts }));

    await expect(
      persistence.commitWebhookPaymentTransition({
        receipt: { providerCode: 'stripe', idempotencyKey: 'evt_1', rawBody: '{}', signatureValid: 'valid' },
        paymentId,
        toStatus: 'paid',
        actor: 'webhook',
      }),
    ).rejects.toThrow(message);
  });

  it('rejects missing, disappeared, and concurrently changed payments plus incomplete reconstruction', async () => {
    const input = {
      receipt: { providerCode: 'stripe', idempotencyKey: 'evt_1', rawBody: '{}', signatureValid: 'valid' as const },
      paymentId,
      toStatus: 'paid' as const,
      actor: 'webhook',
      transitionedAt: now,
    };

    const missing = persistenceWith(
      allCollections({ payments: collection({ findOne: vi.fn().mockResolvedValue(null) }) }),
    );
    await expect(missing.commitWebhookPaymentTransition(input)).rejects.toThrow(`Payment ${paymentId} does not exist.`);

    const disappeared = persistenceWith(
      allCollections({
        payments: collection({ findOne: vi.fn().mockResolvedValueOnce(payment()).mockResolvedValueOnce(null) }),
      }),
    );
    await expect(disappeared.commitWebhookPaymentTransition(input)).rejects.toThrow('disappeared during transition');

    const concurrent = persistenceWith(
      allCollections({
        payments: collection({
          findOne: vi
            .fn()
            .mockResolvedValueOnce(payment())
            .mockResolvedValueOnce(payment({ status: 'failed', version: 2 })),
          updateOne: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
        }),
      }),
    );
    await expect(concurrent.commitWebhookPaymentTransition(input)).rejects.toThrow('changed concurrently');

    const staleRecoveryEvent = persistenceWith(
      allCollections({
        payments: collection({ findOne: vi.fn().mockResolvedValue(payment({ status: 'pending' })) }),
        payment_events: collection({
          findOne: vi.fn().mockResolvedValue({
            _id: 'receipt-stale:state_change',
            paymentId,
            type: 'state_change',
            fromStatus: 'processing',
            toStatus: 'paid',
            actor: 'webhook',
            reason: null,
            providerEvidence: null,
            requestId: null,
            outboxPublishedAt: null,
            createdAt: now,
          }),
        }),
      }),
    );
    await expect(
      staleRecoveryEvent.commitWebhookPaymentTransition({
        ...input,
        receipt: { ...input.receipt, id: 'receipt-stale' },
      }),
    ).rejects.toThrow('changed concurrently');

    const incomplete = persistenceWith(
      allCollections({
        payments: collection({
          findOne: vi
            .fn()
            .mockResolvedValueOnce(payment())
            .mockResolvedValueOnce(payment({ status: 'paid' })),
        }),
        payment_events: collection({ findOne: vi.fn().mockResolvedValue(null) }),
      }),
    );
    await expect(incomplete.commitWebhookPaymentTransition(input)).rejects.toThrow('could not be reconstructed');
  });

  it('uses transition defaults and rejects reconstruction when the receipt disappears', async () => {
    const after = payment({ status: 'paid', version: 2 });
    const payments = collection({ findOne: vi.fn().mockResolvedValueOnce(payment()).mockResolvedValueOnce(after) });
    const receipts = collection({ findOne: vi.fn().mockResolvedValue(null) });
    const events = collection({
      findOne: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({
        _id: 'receipt-1:state_change',
        paymentId,
        type: 'state_change',
        fromStatus: 'processing',
        toStatus: 'paid',
        actor: 'webhook',
        reason: null,
        providerEvidence: null,
        requestId: 'receipt-request',
        outboxPublishedAt: null,
        createdAt: now,
      }),
    });
    const persistence = persistenceWith(
      allCollections({ payments, payment_events: events, payment_webhook_receipts: receipts }),
    );

    await expect(
      persistence.commitWebhookPaymentTransition({
        receipt: {
          id: 'receipt-1',
          providerCode: 'stripe',
          idempotencyKey: 'evt_defaults',
          rawBody: '{}',
          signatureValid: 'valid',
          requestId: 'receipt-request',
        },
        paymentId,
        toStatus: 'paid',
        actor: 'webhook',
      }),
    ).rejects.toThrow('could not be reconstructed');
    expect(events.updateOne).toHaveBeenCalledWith(
      { _id: 'receipt-1:state_change' },
      {
        $setOnInsert: expect.objectContaining({
          reason: null,
          providerEvidence: null,
          requestId: 'receipt-request',
          createdAt: expect.any(Date),
        }),
      },
      { upsert: true },
    );
  });

  it('publishes terminal-money outbox rows before marking and returns zero for an empty batch', async () => {
    const row = {
      _id: 'event-1',
      paymentId,
      type: 'state_change',
      fromStatus: 'processing',
      toStatus: 'paid',
      actor: 'webhook',
      reason: null,
      providerEvidence: null,
      requestId: null,
      outboxPublishedAt: null,
      createdAt: now,
    };
    const events = collection({
      find: vi
        .fn()
        .mockReturnValueOnce(cursor([row]))
        .mockReturnValueOnce(cursor([])),
    });
    const persistence = persistenceWith(allCollections({ payment_events: events }));
    const publishedAt = new Date('2026-08-26T00:00:05.000Z');
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(persistence.claimPaymentOutbox({ count: 10, publishedAt }, publish)).resolves.toBe(1);
    expect(publish).toHaveBeenCalledWith([expect.objectContaining({ paymentId, toStatus: 'paid' })]);
    expect(events.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['event-1'] }, outboxPublishedAt: null },
      { $set: { outboxPublishedAt: publishedAt } },
    );
    await expect(persistence.claimPaymentOutbox({ count: 10, publishedAt }, publish)).resolves.toBe(0);
  });
});
