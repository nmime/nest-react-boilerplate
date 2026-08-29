import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type {
  NormalizedWebhookEvent,
  NormalizedProviderStatus,
  PaymentProviderPort,
  PaymentRecord,
  PaymentStatus,
  PaymentWebhookProcessingStatus,
  PaymentWebhookReceiptRecord,
  PaymentsPersistence,
} from '@app/backend-feature-payments-shared';
import {
  WebhookProcessingException,
  WebhookReplayedException,
  WebhookSignatureInvalidException,
  WebhookStaleException,
} from '../providers/provider-errors';
import { PaymentProviderResolver } from './payment-provider-resolver.service';
import { PaymentWebhookMetricsService } from './webhook-metrics.service';

const webhookInFlightMs = 5_000;
const webhookStaleMs = 24 * 60 * 60 * 1_000;
const terminalStatuses = new Set<PaymentStatus>(['paid', 'cancelled', 'expired', 'refunded']);
const postWebhookProviders = new Set([
  'x' + 'rocket',
  'cryptobot',
  'heleket',
  'nowpayments',
  'yookassa',
  'cloudpayments',
  'stripe',
  'adyen',
]);

export interface PaymentWebhookRequest {
  readonly providerCode: string;
  /** Exact POST bytes represented as UTF-8, or the untouched query representation for GET callbacks. */
  readonly rawBody: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly contentType?: string | null;
  readonly requestId?: string | null;
}

export interface PaymentWebhookResponse {
  readonly accepted: true;
  readonly replayed: boolean;
  readonly processing: PaymentWebhookProcessingStatus;
}

export interface PaymentsWebhooksClock {
  now(): Date;
}

/* v8 ignore next -- exercised only when Nest constructs the service without a deterministic test clock. */
const systemClock: PaymentsWebhooksClock = { now: () => new Date() };

export class PaymentsWebhooksService {
  private readonly logger = new Logger(PaymentsWebhooksService.name);

  constructor(
    private readonly persistence: PaymentsPersistence,
    private readonly providerResolver: PaymentProviderResolver,
    private readonly metrics: PaymentWebhookMetricsService,
    private readonly clock: PaymentsWebhooksClock = systemClock,
  ) {}

  async handle(request: PaymentWebhookRequest): Promise<PaymentWebhookResponse> {
    const startedAt = process.hrtime.bigint();
    if (!postWebhookProviders.has(request.providerCode)) {
      this.metrics.rejected({
        providerCode: request.providerCode,
        rejectionReason: 'unknown_provider',
        outcome: 'rejected',
      });
      throw new WebhookSignatureInvalidException({ meta: { providerCode: request.providerCode } });
    }

    let resolved: Awaited<ReturnType<PaymentProviderResolver['resolveForWebhook']>>;
    try {
      resolved = await this.providerResolver.resolveForWebhook(request.providerCode);
    } catch {
      this.metrics.rejected({
        providerCode: request.providerCode,
        rejectionReason: 'unknown_provider',
        outcome: 'rejected',
      });
      throw new WebhookSignatureInvalidException({ meta: { providerCode: request.providerCode } });
    }

    let verification: Awaited<ReturnType<PaymentProviderPort['verifyWebhook']>>;
    try {
      verification = await resolved.provider.verifyWebhook({ body: request.rawBody, headers: request.headers });
    } catch (error) {
      this.metrics.rejected({ providerCode: request.providerCode, rejectionReason: 'parse', outcome: 'rejected' });
      throw new WebhookSignatureInvalidException({
        cause: asError(error),
        meta: { providerCode: request.providerCode },
      });
    }

    this.metrics.received({ providerCode: request.providerCode, signature: verification.result });
    if (verification.result === 'invalid') {
      this.metrics.rejected({
        providerCode: request.providerCode,
        signature: verification.result,
        rejectionReason: 'bad_signature',
        outcome: 'rejected',
      });
      throw new WebhookSignatureInvalidException({ meta: { providerCode: request.providerCode } });
    }
    if (verification.events.length > 1) {
      this.metrics.rejected({
        providerCode: request.providerCode,
        signature: verification.result,
        rejectionReason: 'parse',
        outcome: 'rejected',
      });
      throw new WebhookSignatureInvalidException({
        meta: { providerCode: request.providerCode, reason: 'multiple_events_not_supported' },
      });
    }

    const receivedAt = this.clock.now();
    const receiptId = randomUUID();
    const receiptInput = {
      id: receiptId,
      providerCode: request.providerCode,
      idempotencyKey: verification.idempotencyKey,
      rawBody: request.rawBody,
      contentType: request.contentType ?? null,
      signatureValid: verification.result,
      signatureKind: headerValue(request.headers, 'x-signature-kind'),
      processingStatus: 'pending' as const,
      requestId: request.requestId ?? null,
      receivedAt,
    };

    let claim: Awaited<ReturnType<PaymentsPersistence['claimWebhookReceipt']>>;
    try {
      claim = await this.persistence.claimWebhookReceipt(
        receiptInput,
        new Date(receivedAt.getTime() - webhookInFlightMs),
      );
    } catch (error) {
      this.metrics.rejected({
        providerCode: request.providerCode,
        rejectionReason: 'persistence',
        outcome: 'error',
      });
      throw new WebhookProcessingException({ cause: asError(error), meta: { stage: 'receipt_claim' } });
    }

    if (claim.kind === 'finalized') {
      return this.complete(request.providerCode, claim.receipt.processingStatus, true, startedAt);
    }
    if (claim.kind === 'inflight') {
      this.metrics.rejected({ providerCode: request.providerCode, rejectionReason: 'replay', outcome: 'pending' });
      throw new WebhookReplayedException({ meta: { processingStatus: claim.receipt.processingStatus } });
    }

    const processing = await this.processVerifiedEvents(
      request,
      resolved.provider,
      verification.events,
      claim.receipt,
      receiptInput,
      receivedAt,
    );
    return this.complete(request.providerCode, processing, false, startedAt);
  }

  private async processVerifiedEvents(
    request: PaymentWebhookRequest,
    provider: PaymentProviderPort,
    events: readonly NormalizedWebhookEvent[],
    receipt: PaymentWebhookReceiptRecord,
    receiptInput: Parameters<PaymentsPersistence['claimWebhookReceipt']>[0],
    receivedAt: Date,
  ): Promise<PaymentWebhookProcessingStatus> {
    if (events.length === 0) {
      await this.finalizeReceipt(receipt.id, 'ignored', 200, receivedAt);
      return 'ignored';
    }
    for (const event of events) {
      // Webhook payloads can contain multiple provider notifications and must be processed in order.
      // eslint-disable-next-line no-await-in-loop
      const applied = await this.processEvent(request, provider, event, receipt, receiptInput, receivedAt);
      if (applied) {
        return 'applied';
      }
    }
    await this.finalizeReceipt(receipt.id, 'ignored', 200, receivedAt);
    return 'ignored';
  }

  private async processEvent(
    request: PaymentWebhookRequest,
    provider: PaymentProviderPort,
    event: NormalizedWebhookEvent,
    receipt: PaymentWebhookReceiptRecord,
    receiptInput: Parameters<PaymentsPersistence['claimWebhookReceipt']>[0],
    receivedAt: Date,
  ): Promise<boolean> {
    const payment = await this.findPayment(request.providerCode, event);
    if (!payment) {
      return false;
    }
    if (isStaleTerminal(payment, event, receivedAt)) {
      await this.finalizeReceipt(receipt.id, 'ignored', 410, receivedAt);
      this.metrics.rejected({ providerCode: request.providerCode, rejectionReason: 'stale', outcome: 'rejected' });
      throw new WebhookStaleException();
    }

    let current: Awaited<ReturnType<PaymentProviderPort['getStatus']>>;
    try {
      current = await provider.getStatus({
        clientId: payment.id,
        providerPaymentId: payment.providerPaymentId ?? event.providerPaymentIdHint,
      });
    } catch (error) {
      await this.markReceiptError(receipt.id, receivedAt, error);
      throw new WebhookProcessingException({ cause: asError(error), meta: { stage: 'provider_status' } });
    }

    const target = normalizeTransition(current.status, current.paidAmount);
    if (
      target.status === payment.status &&
      (target.partialAmount === undefined || target.partialAmount === payment.partialAmount)
    ) {
      return false;
    }
    try {
      await this.persistence.commitWebhookPaymentTransition({
        receipt: { ...receiptInput, id: receipt.id },
        paymentId: payment.id,
        toStatus: target.status,
        actor: `provider:${request.providerCode}`,
        reason: event.providerStatusRaw,
        providerEvidence: {
          eventStatus: event.providerStatusRaw,
          fetchedStatus: current.providerStatusRaw,
        },
        requestId: request.requestId ?? null,
        statusCode: 200,
        transitionedAt: receivedAt,
        providerStatusRaw: current.providerStatusRaw,
        paidAmount: current.paidAmount,
        paidCurrency: current.paidCurrency,
        fee: current.fee,
        partialAmount: target.partialAmount,
      });
      return true;
    } catch (error) {
      await this.markReceiptError(receipt.id, receivedAt, error);
      throw new WebhookProcessingException({ cause: asError(error), meta: { stage: 'transition_commit' } });
    }
  }

  private async findPayment(providerCode: string, event: NormalizedWebhookEvent): Promise<PaymentRecord | null> {
    try {
      if (event.paymentIdHint) {
        return await this.persistence.findPaymentRecord(event.paymentIdHint);
      }
      if (event.providerPaymentIdHint) {
        return await this.persistence.findPaymentRecordByProviderReference(providerCode, event.providerPaymentIdHint);
      }
      return null;
    } catch (error) {
      throw new WebhookProcessingException({ cause: asError(error), meta: { stage: 'payment_lookup' } });
    }
  }

  private async finalizeReceipt(
    id: string,
    processingStatus: PaymentWebhookProcessingStatus,
    statusCode: number,
    processedAt: Date,
  ): Promise<void> {
    try {
      await this.persistence.updateWebhookReceipt(id, { processingStatus, statusCode, error: null, processedAt });
    } catch (error) {
      throw new WebhookProcessingException({ cause: asError(error), meta: { stage: 'receipt_finalize' } });
    }
  }

  private async markReceiptError(id: string, processedAt: Date, error: unknown): Promise<void> {
    try {
      await this.persistence.updateWebhookReceipt(id, {
        processingStatus: 'error',
        statusCode: 502,
        error: error instanceof Error ? error.message : 'Webhook processing failed.',
        processedAt,
      });
    } catch (receiptError) {
      this.logger.error(`payment_webhook_p1 receipt=${id} failed_to_record_error`, receiptError);
    }
  }

  private complete(
    providerCode: string,
    processing: PaymentWebhookProcessingStatus,
    replayed: boolean,
    startedAt: bigint,
  ): PaymentWebhookResponse {
    let outcome: 'applied' | 'ignored' | 'replayed' = 'ignored';
    if (replayed) {
      outcome = 'replayed';
    } else if (processing === 'applied') {
      outcome = 'applied';
    }
    this.metrics.completed({
      providerCode,
      outcome,
      durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    });
    return { accepted: true, replayed, processing };
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name];
  if (typeof value === 'string') {
    return value;
  }
  return value?.[0] ?? null;
}

function isStaleTerminal(payment: PaymentRecord, event: NormalizedWebhookEvent, now: Date): boolean {
  return (
    terminalStatuses.has(payment.status) &&
    event.eventTime !== undefined &&
    now.getTime() - event.eventTime.getTime() > webhookStaleMs
  );
}

function normalizeTransition(
  status: NormalizedProviderStatus,
  paidAmount?: string,
): { status: PaymentStatus; partialAmount?: string | null } {
  if (status === 'underpaid') {
    return { status: 'processing', partialAmount: paidAmount ?? null };
  }
  if (status === 'aml_hold') {
    return { status: 'failed' };
  }
  return { status };
}
