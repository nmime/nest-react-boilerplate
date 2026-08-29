// @requirements REQ-PAYMENT-WEBHOOK-001 REQ-PAYMENT-WEBHOOK-002 REQ-PAYMENT-WEBHOOK-003
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PaymentProviderPort,
  PaymentProviderRecord,
  PaymentRecord,
  PaymentWebhookReceiptClaimOutcome,
  PaymentWebhookReceiptRecord,
  PaymentsPersistence,
} from '@app/backend-feature-payments-shared';
import {
  WebhookProcessingException,
  WebhookReplayedException,
  WebhookSignatureInvalidException,
  WebhookStaleException,
} from '../providers/provider-errors';
import type { PaymentProviderResolver } from './payment-provider-resolver.service';
import { PaymentsWebhooksService } from './payments-webhooks.service';
import { PaymentWebhookMetricsService } from './webhook-metrics.service';

const now = new Date('2026-08-27T02:00:00.000Z');

const providerRecord: PaymentProviderRecord = {
  id: 'provider-1',
  code: 'stripe',
  kind: 'fiat',
  enabled: false,
  priority: 100,
  tenantId: null,
  supportedCurrencies: [],
  config: {},
  baseUrl: 'https://provider.invalid',
  version: 'test',
  credentialsEncrypted: null,
  timeoutMs: 1_000,
  regionAllow: null,
  regionDeny: ['RU'],
  createdAt: now,
  updatedAt: now,
  updatedBy: null,
};

const payment: PaymentRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  providerCode: 'stripe',
  providerPaymentId: 'pi_1',
  status: 'processing',
  amount: '10.00',
  currency: 'USD',
  fxSnapshot: null,
  providerStatusRaw: 'processing',
  paidAmount: null,
  paidCurrency: null,
  fee: null,
  partialAmount: null,
  refundedAmount: '0',
  meta: {},
  expiresAt: null,
  createdAt: now,
  updatedAt: now,
  paidAt: null,
  cancelledAt: null,
  expiredAt: null,
  refundedAt: null,
  version: 1,
};

function asTestError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function receipt(input: Partial<PaymentWebhookReceiptRecord> = {}): PaymentWebhookReceiptRecord {
  return {
    id: 'receipt-1',
    providerCode: 'stripe',
    idempotencyKey: 'evt_1',
    rawBody: '{"id":"evt_1"}',
    contentType: 'application/json',
    signatureValid: 'valid',
    signatureKind: 'hmac-sha256',
    statusCode: null,
    processingStatus: 'pending',
    error: null,
    requestId: 'request-1',
    receivedAt: now,
    claimedAt: now,
    processedAt: null,
    ...input,
  };
}

interface SetupInput {
  verification?: Awaited<ReturnType<PaymentProviderPort['verifyWebhook']>>;
  status?: Awaited<ReturnType<PaymentProviderPort['getStatus']>>;
  claim?: PaymentWebhookReceiptClaimOutcome;
  payment?: PaymentRecord | null;
  providerReferencePayment?: PaymentRecord | null;
  claimError?: unknown;
  commitError?: unknown;
  updateError?: unknown;
  resolveError?: unknown;
  verifyError?: unknown;
  paymentLookupError?: unknown;
}

function setup(input: SetupInput = {}) {
  const provider = {
    providerCode: 'stripe',
    verifyWebhook: vi.fn(async () => {
      if (input.verifyError !== undefined) {
        throw asTestError(input.verifyError);
      }
      return (
        input.verification ?? {
          result: 'valid' as const,
          idempotencyKey: 'evt_1',
          events: [
            {
              paymentIdHint: payment.id,
              providerStatusRaw: 'payment_intent.succeeded',
              paidAmount: '10.00',
              paidCurrency: 'USD',
              eventTime: now,
            },
          ],
        }
      );
    }),
    getStatus: vi.fn(
      async () =>
        input.status ?? {
          status: 'paid' as const,
          providerStatusRaw: 'succeeded',
          paidAmount: '10.00',
          paidCurrency: 'USD',
          finalizedAt: now,
        },
    ),
  } as unknown as PaymentProviderPort;
  const persistence = {
    claimWebhookReceipt: vi.fn(async (value) => {
      if (input.claimError !== undefined) {
        throw asTestError(input.claimError);
      }
      return input.claim ?? { kind: 'claimed', receipt: receipt({ ...value, id: 'receipt-1' }) };
    }),
    updateWebhookReceipt: vi.fn(async (_id, value) => {
      if (input.updateError !== undefined) {
        throw asTestError(input.updateError);
      }
      return receipt(value);
    }),
    findPaymentRecord: vi.fn(async () => {
      if (input.paymentLookupError !== undefined) {
        throw asTestError(input.paymentLookupError);
      }
      return input.payment === undefined ? payment : input.payment;
    }),
    findPaymentRecordByProviderReference: vi.fn(async () => input.providerReferencePayment ?? null),
    commitWebhookPaymentTransition: vi.fn(async (value) => {
      if (input.commitError !== undefined) {
        throw asTestError(input.commitError);
      }
      return {
        receipt: receipt({ processingStatus: 'applied', statusCode: 200 }),
        payment: { ...payment, status: value.toStatus },
        event: {},
      };
    }),
  } as unknown as PaymentsPersistence & Record<string, ReturnType<typeof vi.fn>>;
  const resolver = {
    resolveForWebhook: vi.fn(async () => {
      if (input.resolveError !== undefined) {
        throw asTestError(input.resolveError);
      }
      return { record: providerRecord, provider };
    }),
  } as unknown as PaymentProviderResolver & Record<string, ReturnType<typeof vi.fn>>;
  const metrics = {
    received: vi.fn(),
    rejected: vi.fn(),
    completed: vi.fn(),
  } as unknown as PaymentWebhookMetricsService & Record<string, ReturnType<typeof vi.fn>>;
  const service = new PaymentsWebhooksService(persistence, resolver, metrics, { now: () => now });
  return { metrics, persistence, provider, resolver, service };
}

const request = {
  providerCode: 'stripe',
  rawBody: '{ "id": "evt_1", "amount": 1000 }',
  headers: { 'stripe-signature': 't=1,v1=sig' },
  contentType: 'application/json',
  requestId: 'request-1',
} as const;

describe('PaymentsWebhooksService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('rejects unknown providers before verification or persistence', async () => {
    const { persistence, resolver, service } = setup();

    await expect(service.handle({ ...request, providerCode: 'unknown' })).rejects.toBeInstanceOf(
      WebhookSignatureInvalidException,
    );
    expect(resolver.resolveForWebhook).not.toHaveBeenCalled();
    expect(persistence.claimWebhookReceipt).not.toHaveBeenCalled();
  });

  it('maps missing registry/adapters to the same unroutable 400 without create-time gates', async () => {
    const { persistence, service } = setup({ resolveError: new Error('missing') });

    await expect(service.handle(request)).rejects.toBeInstanceOf(WebhookSignatureInvalidException);
    expect(persistence.claimWebhookReceipt).not.toHaveBeenCalled();
  });

  it('maps provider verification/parser failures to 400 before persistence', async () => {
    const { persistence, service } = setup({ verifyError: new Error('malformed signed payload') });

    await expect(service.handle(request)).rejects.toBeInstanceOf(WebhookSignatureInvalidException);
    expect(persistence.claimWebhookReceipt).not.toHaveBeenCalled();
  });

  it('preserves optional signature metadata, request metadata, and provider fallback identity on the claim', async () => {
    const scenario = setup();

    await expect(
      scenario.service.handle({
        providerCode: 'stripe',
        rawBody: '{}',
        headers: { 'x-signature-kind': 'hmac-sha256' },
      }),
    ).resolves.toMatchObject({ processing: 'applied' });
    expect(scenario.persistence.claimWebhookReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: null, requestId: null, signatureKind: 'hmac-sha256' }),
      expect.any(Date),
    );

    const emptySignatureHeader = setup();
    await emptySignatureHeader.service.handle({
      providerCode: 'stripe',
      rawBody: '{}',
      headers: { 'x-signature-kind': [] },
    });
    expect(emptySignatureHeader.persistence.claimWebhookReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ signatureKind: null }),
      expect.any(Date),
    );
  });

  it('rejects multi-event deliveries before persistence until receipt-wide batching exists', async () => {
    const event = { paymentIdHint: payment.id, providerStatusRaw: 'succeeded' };
    const { persistence, service } = setup({
      verification: { result: 'valid', idempotencyKey: 'evt_batch', events: [event, event] },
    });

    await expect(service.handle(request)).rejects.toBeInstanceOf(WebhookSignatureInvalidException);
    expect(persistence.claimWebhookReceipt).not.toHaveBeenCalled();
  });

  it('authenticates exact raw bytes and creates no receipt for an invalid signature', async () => {
    const { persistence, provider, service } = setup({
      verification: { result: 'invalid', idempotencyKey: 'evt_bad', events: [] },
    });

    await expect(service.handle(request)).rejects.toBeInstanceOf(WebhookSignatureInvalidException);
    expect(provider.verifyWebhook).toHaveBeenCalledWith({ body: request.rawBody, headers: request.headers });
    expect(persistence.claimWebhookReceipt).not.toHaveBeenCalled();
    expect(persistence.findPaymentRecord).not.toHaveBeenCalled();
  });

  it('replays finalized receipts with 200 and zero provider dispatch', async () => {
    for (const processingStatus of ['applied', 'ignored'] as const) {
      const { persistence, provider, service } = setup({
        claim: { kind: 'finalized', receipt: receipt({ processingStatus }) },
      });

      // The two terminal receipt variants are verified serially because each owns its own service mock.
      // eslint-disable-next-line no-await-in-loop
      await expect(service.handle(request)).resolves.toEqual({
        accepted: true,
        replayed: true,
        processing: processingStatus,
      });
      expect(provider.getStatus).not.toHaveBeenCalled();
      expect(persistence.commitWebhookPaymentTransition).not.toHaveBeenCalled();
    }
  });

  it('rejects an atomic in-flight duplicate with 409 and zero provider dispatch', async () => {
    const { provider, service } = setup({ claim: { kind: 'inflight', receipt: receipt() } });

    await expect(service.handle(request)).rejects.toBeInstanceOf(WebhookReplayedException);
    expect(provider.getStatus).not.toHaveBeenCalled();
  });

  it('records a provider-status failure and still returns 502 when the error receipt write also fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const scenario = setup({ status: undefined });
    vi.mocked(scenario.provider.getStatus).mockRejectedValueOnce('offline');
    vi.mocked(scenario.persistence.updateWebhookReceipt).mockRejectedValueOnce(new Error('receipt write down'));

    await expect(scenario.service.handle(request)).rejects.toBeInstanceOf(WebhookProcessingException);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('resumes a stale/error claim rather than replay-acking it', async () => {
    const { persistence, provider, service } = setup({ claim: { kind: 'resumable', receipt: receipt() } });

    await expect(service.handle(request)).resolves.toMatchObject({ replayed: false, processing: 'applied' });
    expect(provider.getStatus).toHaveBeenCalledOnce();
    expect(persistence.commitWebhookPaymentTransition).toHaveBeenCalledOnce();
  });

  it('returns 502 when atomic claim persistence is transiently unavailable', async () => {
    await expect(setup({ claimError: new Error('database down') }).service.handle(request)).rejects.toBeInstanceOf(
      WebhookProcessingException,
    );
  });

  it('maps payment lookup persistence failures to 502', async () => {
    await expect(setup({ paymentLookupError: new Error('read down') }).service.handle(request)).rejects.toBeInstanceOf(
      WebhookProcessingException,
    );
  });

  it('rejects an older-than-24h event against a terminal payment with durable 410', async () => {
    const { persistence, provider, service } = setup({
      payment: { ...payment, status: 'paid', paidAt: now },
      verification: {
        result: 'valid',
        idempotencyKey: 'evt_stale',
        events: [
          {
            paymentIdHint: payment.id,
            providerStatusRaw: 'succeeded',
            eventTime: new Date(now.getTime() - 24 * 60 * 60 * 1_000 - 1),
          },
        ],
      },
    });

    await expect(service.handle(request)).rejects.toBeInstanceOf(WebhookStaleException);
    expect(persistence.updateWebhookReceipt).toHaveBeenCalledWith(
      'receipt-1',
      expect.objectContaining({ processingStatus: 'ignored', statusCode: 410 }),
    );
    expect(provider.getStatus).not.toHaveBeenCalled();
  });

  it('ignores empty, unroutable, missing, and no-op deliveries only after a durable receipt', async () => {
    const empty = setup({ verification: { result: 'none', idempotencyKey: 'empty', events: [] } });
    await expect(empty.service.handle({ ...request, providerCode: 'yookassa' })).resolves.toMatchObject({
      processing: 'ignored',
    });

    const noHint = setup({
      verification: { result: 'valid', idempotencyKey: 'no-hint', events: [{ providerStatusRaw: 'pending' }] },
    });
    await expect(noHint.service.handle(request)).resolves.toMatchObject({ processing: 'ignored' });

    const missing = setup({ payment: null });
    await expect(missing.service.handle(request)).resolves.toMatchObject({ processing: 'ignored' });

    const noOp = setup({ status: { status: 'processing', providerStatusRaw: 'processing' } });
    await expect(noOp.service.handle(request)).resolves.toMatchObject({ processing: 'ignored' });
  });

  it('uses the event provider id for status re-fetch when the stored provider id is absent', async () => {
    const scenario = setup({
      payment: { ...payment, providerPaymentId: null },
      verification: {
        result: 'valid',
        idempotencyKey: 'provider-id-fallback',
        events: [{ paymentIdHint: payment.id, providerPaymentIdHint: 'pi_from_event', providerStatusRaw: 'succeeded' }],
      },
    });

    await expect(scenario.service.handle(request)).resolves.toMatchObject({ processing: 'applied' });
    expect(scenario.provider.getStatus).toHaveBeenCalledWith({
      clientId: payment.id,
      providerPaymentId: 'pi_from_event',
    });
  });

  it('resolves payment identity by provider reference when our id is absent', async () => {
    const { persistence, service } = setup({
      verification: {
        result: 'valid',
        idempotencyKey: 'provider-reference',
        events: [{ providerPaymentIdHint: 'pi_1', providerStatusRaw: 'succeeded' }],
      },
      providerReferencePayment: payment,
    });

    await expect(service.handle(request)).resolves.toMatchObject({ processing: 'applied' });
    expect(persistence.findPaymentRecordByProviderReference).toHaveBeenCalledWith('stripe', 'pi_1');
  });

  it('re-fetches provider status and returns 200 only after atomic receipt/event/payment persistence', async () => {
    const { persistence, provider, service } = setup();

    await expect(service.handle(request)).resolves.toEqual({ accepted: true, replayed: false, processing: 'applied' });
    expect(provider.getStatus).toHaveBeenCalledWith({ clientId: payment.id, providerPaymentId: 'pi_1' });
    expect(persistence.commitWebhookPaymentTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: payment.id,
        toStatus: 'paid',
        paidAmount: '10.00',
        paidCurrency: 'USD',
      }),
    );
    expect(persistence.updateWebhookReceipt).not.toHaveBeenCalled();
  });

  it('supports non-paid transitions and records underpayment/AML evidence', async () => {
    const underpaid = setup({
      status: { status: 'underpaid', providerStatusRaw: 'partially_paid', paidAmount: '4.00', paidCurrency: 'USD' },
    });

    await expect(underpaid.service.handle(request)).resolves.toMatchObject({ processing: 'applied' });
    expect(underpaid.persistence.commitWebhookPaymentTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: 'processing', partialAmount: '4.00' }),
    );

    const underpaidWithoutAmount = setup({ status: { status: 'underpaid', providerStatusRaw: 'underpaid' } });
    await expect(underpaidWithoutAmount.service.handle(request)).resolves.toMatchObject({ processing: 'ignored' });

    const amlHold = setup({ status: { status: 'aml_hold', providerStatusRaw: 'aml_hold' } });
    await expect(amlHold.service.handle(request)).resolves.toMatchObject({ processing: 'applied' });
    expect(amlHold.persistence.commitWebhookPaymentTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toStatus: 'failed' }),
    );
  });

  it('returns 502 if transition persistence or terminal receipt persistence fails', async () => {
    await expect(setup({ commitError: new Error('transaction down') }).service.handle(request)).rejects.toBeInstanceOf(
      WebhookProcessingException,
    );
    await expect(
      setup({
        verification: { result: 'valid', idempotencyKey: 'empty', events: [] },
        updateError: new Error('write down'),
      }).service.handle(request),
    ).rejects.toBeInstanceOf(WebhookProcessingException);
  });
});
