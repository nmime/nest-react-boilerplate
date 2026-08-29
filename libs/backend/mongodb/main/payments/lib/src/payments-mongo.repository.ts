import { randomUUID } from 'node:crypto';
import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import type {
  ClaimPaymentOutboxParams,
  CommittedWebhookPaymentTransition,
  CommitWebhookPaymentTransitionParams,
  CreatePaymentEventParams,
  CreatePaymentRecordParams,
  CreatePaymentRefundParams,
  CreatePaymentsDto,
  CreatePaymentWebhookReceiptParams,
  PaymentEventRecord,
  PaymentOutboxPublisher,
  PaymentProviderHealthRecord,
  PaymentProviderRecord,
  PaymentRecord,
  PaymentRefundRecord,
  PaymentsDto,
  PaymentWebhookReceiptClaimOutcome,
  PaymentWebhookReceiptRecord,
  UpdatePaymentWebhookReceiptParams,
  UpsertPaymentProviderHealthParams,
  UpsertPaymentProviderParams,
} from '@app/backend-feature-payments-shared';
import { MongoDatabaseToken } from '@app/backend-mongodb-main';
import { Inject, Injectable } from '@nestjs/common';
import type { Collection, Db, Filter, MongoServerError } from 'mongodb';

export type PaymentsMongoOrderedWriteStage = 'receipt' | 'event' | 'payment';

export interface PaymentsMongoOrderedWriteObserver {
  after(stage: PaymentsMongoOrderedWriteStage): void | Promise<void>;
}
import {
  PaymentEventsCollectionName,
  PaymentProviderHealthCollectionName,
  PaymentProvidersCollectionName,
  PaymentRefundsCollectionName,
  PaymentsCollectionName,
  PaymentWebhookReceiptsCollectionName,
} from './payments-mongo.collection';
import type {
  PaymentDocument,
  PaymentEventDocument,
  PaymentProviderDocument,
  PaymentProviderHealthDocument,
  PaymentRefundDocument,
  PaymentWebhookReceiptDocument,
} from './payments-mongo.types';

function toPaymentsDto(document: PaymentDocument): PaymentsDto {
  return {
    id: document._id,
    name: typeof document.meta['name'] === 'string' ? document.meta['name'] : document._id,
    createdAt: document.createdAt.toISOString(),
  };
}

function toPaymentRecord(document: PaymentDocument): PaymentRecord {
  return {
    id: document._id,
    tenantId: document.tenantId,
    providerCode: document.providerCode,
    providerPaymentId: document.providerPaymentId,
    status: document.status,
    amount: document.amount,
    currency: document.currency,
    fxSnapshot: document.fxSnapshot,
    providerStatusRaw: document.providerStatusRaw,
    paidAmount: document.paidAmount,
    paidCurrency: document.paidCurrency,
    fee: document.fee,
    partialAmount: document.partialAmount,
    refundedAmount: document.refundedAmount,
    meta: document.meta,
    expiresAt: document.expiresAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    paidAt: document.paidAt,
    cancelledAt: document.cancelledAt,
    expiredAt: document.expiredAt,
    refundedAt: document.refundedAt,
    version: document.version,
  };
}

function toPaymentEventRecord(document: PaymentEventDocument): PaymentEventRecord {
  return {
    paymentId: document.paymentId,
    type: document.type,
    fromStatus: document.fromStatus,
    toStatus: document.toStatus,
    actor: document.actor,
    reason: document.reason,
    providerEvidence: document.providerEvidence,
    requestId: document.requestId,
    outboxPublishedAt: document.outboxPublishedAt,
    createdAt: document.createdAt,
  };
}

function toPaymentProviderRecord(document: PaymentProviderDocument): PaymentProviderRecord {
  return {
    id: document._id,
    code: document.code,
    kind: document.kind,
    enabled: document.enabled,
    priority: document.priority,
    tenantId: document.tenantId,
    supportedCurrencies: document.supportedCurrencies,
    config: document.config,
    baseUrl: document.baseUrl,
    version: document.version,
    credentialsEncrypted: document.credentialsEncrypted,
    timeoutMs: document.timeoutMs,
    regionAllow: document.regionAllow,
    regionDeny: document.regionDeny,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
  };
}

function toPaymentProviderHealthRecord(document: PaymentProviderHealthDocument): PaymentProviderHealthRecord {
  return {
    providerCode: document._id,
    state: document.state,
    consecutiveErrors: document.consecutiveErrors,
    lastSuccessAt: document.lastSuccessAt,
    lastErrorAt: document.lastErrorAt,
    lastErrorClass: document.lastErrorClass,
    updatedAt: document.updatedAt,
  };
}

function toPaymentWebhookReceiptRecord(document: PaymentWebhookReceiptDocument): PaymentWebhookReceiptRecord {
  return {
    id: document._id,
    providerCode: document.providerCode,
    idempotencyKey: document.idempotencyKey,
    rawBody: document.rawBody,
    contentType: document.contentType,
    signatureValid: document.signatureValid,
    signatureKind: document.signatureKind,
    statusCode: document.statusCode,
    processingStatus: document.processingStatus,
    error: document.error,
    requestId: document.requestId,
    receivedAt: document.receivedAt,
    claimedAt: document.claimedAt,
    processedAt: document.processedAt,
  };
}

function toPaymentRefundRecord(document: PaymentRefundDocument): PaymentRefundRecord {
  return {
    id: document._id,
    paymentId: document.paymentId,
    providerRefundId: document.providerRefundId,
    amount: document.amount,
    currency: document.currency,
    status: document.status,
    initiatedBy: document.initiatedBy,
    providerEvidence: document.providerEvidence,
    reason: document.reason,
    createdAt: document.createdAt,
    confirmedAt: document.confirmedAt,
  };
}

function newPaymentDocument(input: CreatePaymentRecordParams): PaymentDocument {
  const createdAt = input.createdAt ?? new Date();
  return {
    _id: input.id,
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
}

function newEventDocument(input: CreatePaymentEventParams, id: string = randomUUID()): PaymentEventDocument {
  return {
    _id: id,
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
}

function newReceiptDocument(input: CreatePaymentWebhookReceiptParams): PaymentWebhookReceiptDocument {
  return {
    _id: input.id ?? randomUUID(),
    providerCode: input.providerCode,
    idempotencyKey: input.idempotencyKey,
    rawBody: input.rawBody,
    contentType: input.contentType ?? null,
    signatureValid: input.signatureValid,
    signatureKind: input.signatureKind ?? null,
    statusCode: input.statusCode ?? null,
    processingStatus: input.processingStatus ?? 'pending',
    error: input.error ?? null,
    requestId: input.requestId ?? null,
    receivedAt: input.receivedAt ?? new Date(),
    claimedAt: input.claimedAt ?? input.receivedAt ?? new Date(),
    processedAt: input.processedAt ?? null,
  };
}

/**
 * Native-driver implementation of the storage-neutral payments port.
 *
 * MongoDB transactions are deliberately not used. Webhook transitions follow the documented
 * receipt → event → payment order. The receipt replay-wall index and a deterministic event id make
 * every prefix recoverable: retrying after a crash reuses the pending receipt, upserts the same
 * event, applies the versioned payment update at most once, then marks the receipt applied.
 *
 * Outbox publishing is also intentionally at-least-once: publish happens before the mark. A crash
 * in between republishes on the next tick, so consumers must retain their existing idempotency.
 */
@Injectable()
export class PaymentsMongoPersistence extends PaymentsPersistence {
  private readonly payments: Collection<PaymentDocument>;
  private readonly events: Collection<PaymentEventDocument>;
  private readonly receipts: Collection<PaymentWebhookReceiptDocument>;
  private readonly providers: Collection<PaymentProviderDocument>;
  private readonly refunds: Collection<PaymentRefundDocument>;
  private readonly health: Collection<PaymentProviderHealthDocument>;

  constructor(
    @Inject(MongoDatabaseToken) database: Db,
    private readonly orderedWriteObserver?: PaymentsMongoOrderedWriteObserver,
  ) {
    super();
    this.payments = database.collection<PaymentDocument>(PaymentsCollectionName);
    this.events = database.collection<PaymentEventDocument>(PaymentEventsCollectionName);
    this.receipts = database.collection<PaymentWebhookReceiptDocument>(PaymentWebhookReceiptsCollectionName);
    this.providers = database.collection<PaymentProviderDocument>(PaymentProvidersCollectionName);
    this.refunds = database.collection<PaymentRefundDocument>(PaymentRefundsCollectionName);
    this.health = database.collection<PaymentProviderHealthDocument>(PaymentProviderHealthCollectionName);
  }

  async listPayments(): Promise<PaymentsDto[]> {
    const rows = await this.payments.find({}, { sort: { createdAt: -1, _id: 1 } }).toArray();
    return rows.map(toPaymentsDto);
  }

  async createPayment(input: CreatePaymentsDto): Promise<PaymentsDto> {
    const record = await this.createPaymentRecord({
      id: randomUUID(),
      tenantId: '00000000-0000-0000-0000-000000000000',
      providerCode: 'scaffold',
      amount: '0',
      currency: 'XXX',
      meta: { name: input.name },
    });
    return { id: record.id, name: input.name, createdAt: record.createdAt.toISOString() };
  }

  async findPayment(id: string): Promise<PaymentsDto | null> {
    const row = await this.payments.findOne({ _id: id });
    return row ? toPaymentsDto(row) : null;
  }

  async listPaymentRecords(tenantId: string): Promise<PaymentRecord[]> {
    const rows = await this.payments.find({ tenantId }, { sort: { createdAt: -1, _id: 1 } }).toArray();
    return rows.map(toPaymentRecord);
  }

  async createPaymentRecord(input: CreatePaymentRecordParams): Promise<PaymentRecord> {
    const payment = newPaymentDocument(input);
    await this.payments.insertOne(payment);
    await this.events.updateOne(
      { _id: `${payment._id}:created` },
      {
        $setOnInsert: newEventDocument(
          {
            paymentId: payment._id,
            type: 'created',
            fromStatus: null,
            toStatus: payment.status,
            actor: 'system',
            createdAt: payment.createdAt,
          },
          `${payment._id}:created`,
        ),
      },
      { upsert: true },
    );
    return toPaymentRecord(payment);
  }

  async findPaymentRecord(id: string): Promise<PaymentRecord | null> {
    const row = await this.payments.findOne({ _id: id });
    return row ? toPaymentRecord(row) : null;
  }

  async findPaymentRecordByProviderReference(
    providerCode: string,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null> {
    const row = await this.payments.findOne({ providerCode, providerPaymentId });
    return row ? toPaymentRecord(row) : null;
  }

  async appendPaymentEvent(input: CreatePaymentEventParams): Promise<PaymentEventRecord> {
    const event = newEventDocument(input);
    await this.events.insertOne(event);
    return toPaymentEventRecord(event);
  }

  async listPaymentEvents(paymentId: string): Promise<PaymentEventRecord[]> {
    const rows = await this.events.find({ paymentId }, { sort: { createdAt: 1, _id: 1 } }).toArray();
    return rows.map(toPaymentEventRecord);
  }

  async listPaymentProviders(tenantId?: string): Promise<PaymentProviderRecord[]> {
    const filter: Filter<PaymentProviderDocument> =
      tenantId === undefined ? {} : { $or: [{ tenantId }, { tenantId: null }] };
    const rows = await this.providers.find(filter, { sort: { priority: 1, code: 1 } }).toArray();
    return rows.map(toPaymentProviderRecord);
  }

  async findPaymentProvider(code: string, tenantId?: string): Promise<PaymentProviderRecord | null> {
    if (tenantId !== undefined) {
      const tenant = await this.providers.findOne({ code, tenantId });
      if (tenant) {
        return toPaymentProviderRecord(tenant);
      }
    }
    const platform = await this.providers.findOne({ code, tenantId: null });
    return platform ? toPaymentProviderRecord(platform) : null;
  }

  async upsertPaymentProvider(input: UpsertPaymentProviderParams): Promise<PaymentProviderRecord> {
    const filter = { code: input.code, tenantId: input.tenantId ?? null };
    const existing = await this.providers.findOne(filter);
    const now = new Date();
    const document: PaymentProviderDocument = {
      _id: existing?._id ?? input.id ?? randomUUID(),
      code: input.code,
      kind: input.kind,
      enabled: input.enabled ?? existing?.enabled ?? false,
      priority: input.priority ?? existing?.priority ?? 100,
      tenantId: input.tenantId ?? null,
      supportedCurrencies: input.supportedCurrencies ?? existing?.supportedCurrencies ?? [],
      config: input.config ?? existing?.config ?? {},
      baseUrl: input.baseUrl,
      version: input.version,
      credentialsEncrypted:
        input.credentialsEncrypted === undefined
          ? (existing?.credentialsEncrypted ?? null)
          : input.credentialsEncrypted,
      timeoutMs: input.timeoutMs ?? existing?.timeoutMs ?? 15_000,
      regionAllow: input.regionAllow === undefined ? (existing?.regionAllow ?? null) : input.regionAllow,
      regionDeny: input.regionDeny ?? existing?.regionDeny ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      updatedBy: input.updatedBy === undefined ? (existing?.updatedBy ?? null) : input.updatedBy,
    };
    await this.providers.replaceOne(filter, document, { upsert: true });
    return toPaymentProviderRecord(document);
  }

  async findPaymentProviderHealth(providerCode: string): Promise<PaymentProviderHealthRecord | null> {
    const row = await this.health.findOne({ _id: providerCode });
    return row ? toPaymentProviderHealthRecord(row) : null;
  }

  async upsertPaymentProviderHealth(input: UpsertPaymentProviderHealthParams): Promise<PaymentProviderHealthRecord> {
    const existing = await this.health.findOne({ _id: input.providerCode });
    const document: PaymentProviderHealthDocument = {
      _id: input.providerCode,
      state: input.state,
      consecutiveErrors: input.consecutiveErrors,
      lastSuccessAt: input.lastSuccessAt === undefined ? (existing?.lastSuccessAt ?? null) : input.lastSuccessAt,
      lastErrorAt: input.lastErrorAt === undefined ? (existing?.lastErrorAt ?? null) : input.lastErrorAt,
      lastErrorClass: input.lastErrorClass === undefined ? (existing?.lastErrorClass ?? null) : input.lastErrorClass,
      updatedAt: input.updatedAt ?? new Date(),
    };
    await this.health.replaceOne({ _id: input.providerCode }, document, { upsert: true });
    return toPaymentProviderHealthRecord(document);
  }

  async findWebhookReceipt(providerCode: string, idempotencyKey: string): Promise<PaymentWebhookReceiptRecord | null> {
    const row = await this.receipts.findOne({ providerCode, idempotencyKey });
    return row ? toPaymentWebhookReceiptRecord(row) : null;
  }

  async claimWebhookReceipt(
    input: CreatePaymentWebhookReceiptParams,
    inflightBefore: Date,
  ): Promise<PaymentWebhookReceiptClaimOutcome> {
    const candidate = newReceiptDocument(input);
    const resumed = await this.receipts.findOneAndUpdate(
      {
        providerCode: input.providerCode,
        idempotencyKey: input.idempotencyKey,
        $or: [
          { processingStatus: { $in: ['rejected', 'error'] } },
          { processingStatus: 'pending', claimedAt: { $lte: inflightBefore } },
        ],
      },
      {
        $set: {
          processingStatus: 'pending',
          statusCode: null,
          error: null,
          processedAt: null,
          claimedAt: candidate.claimedAt,
        },
      },
      { returnDocument: 'after' },
    );
    if (resumed) {
      return { kind: 'resumable', receipt: toPaymentWebhookReceiptRecord(resumed) };
    }
    try {
      await this.receipts.insertOne(candidate);
      return { kind: 'claimed', receipt: toPaymentWebhookReceiptRecord(candidate) };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await this.receipts.findOne({
        providerCode: input.providerCode,
        idempotencyKey: input.idempotencyKey,
      });
      if (!existing) {
        throw error;
      }
      if (existing.processingStatus === 'applied' || existing.processingStatus === 'ignored') {
        return { kind: 'finalized', receipt: toPaymentWebhookReceiptRecord(existing) };
      }
      return { kind: 'inflight', receipt: toPaymentWebhookReceiptRecord(existing) };
    }
  }

  async insertWebhookReceipt(input: CreatePaymentWebhookReceiptParams): Promise<PaymentWebhookReceiptRecord> {
    const receipt = newReceiptDocument(input);
    await this.receipts.insertOne(receipt);
    return toPaymentWebhookReceiptRecord(receipt);
  }

  async updateWebhookReceipt(
    id: string,
    input: UpdatePaymentWebhookReceiptParams,
  ): Promise<PaymentWebhookReceiptRecord> {
    const set: Record<string, unknown> = {};
    if (input.processingStatus !== undefined) {
      set['processingStatus'] = input.processingStatus;
    }
    if (input.statusCode !== undefined) {
      set['statusCode'] = input.statusCode;
    }
    if (input.error !== undefined) {
      set['error'] = input.error;
    }
    if (input.processedAt !== undefined) {
      set['processedAt'] = input.processedAt;
    }
    const result = await this.receipts.findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' });
    if (!result) {
      throw new Error(`Webhook receipt ${id} does not exist.`);
    }
    return toPaymentWebhookReceiptRecord(result);
  }

  async commitWebhookPaymentTransition(
    input: CommitWebhookPaymentTransitionParams,
  ): Promise<CommittedWebhookPaymentTransition> {
    const receipt = await this.insertOrRecoverReceipt(input.receipt);
    await this.observeOrderedWrite('receipt');

    const paymentBefore = await this.payments.findOne({ _id: input.paymentId });
    if (!paymentBefore) {
      throw new Error(`Payment ${input.paymentId} does not exist.`);
    }

    const at = input.transitionedAt ?? new Date();
    const eventId = `${receipt._id}:state_change`;
    const existingEvent = await this.events.findOne({ _id: eventId });
    const event =
      existingEvent ??
      newEventDocument(
        {
          paymentId: paymentBefore._id,
          type: 'state_change',
          fromStatus: paymentBefore.status,
          toStatus: input.toStatus,
          actor: input.actor,
          reason: input.reason ?? null,
          providerEvidence: input.providerEvidence ?? null,
          requestId: input.requestId ?? input.receipt.requestId ?? null,
          createdAt: at,
        },
        eventId,
      );
    assertRecoverableEvent(event, input);
    await this.events.updateOne({ _id: eventId }, { $setOnInsert: event }, { upsert: true });
    await this.observeOrderedWrite('event');

    let payment = paymentBefore;
    if (payment.status !== input.toStatus) {
      if (payment.status !== event.fromStatus) {
        throw new Error(`Payment ${input.paymentId} changed concurrently; replay the webhook transition.`);
      }
      const update = paymentTransitionUpdate(payment, input, at);
      const result = await this.payments.updateOne(
        { _id: payment._id, version: payment.version, status: payment.status },
        update,
      );
      const after = await this.payments.findOne({ _id: payment._id });
      if (!after) {
        throw new Error(`Payment ${input.paymentId} disappeared during transition.`);
      }
      if (result.modifiedCount === 0 && after.status !== input.toStatus) {
        throw new Error(`Payment ${input.paymentId} changed concurrently; replay the webhook transition.`);
      }
      payment = after;
    }
    await this.observeOrderedWrite('payment');

    await this.receipts.updateOne(
      { _id: receipt._id },
      {
        $set: {
          processingStatus: 'applied',
          statusCode: input.statusCode ?? 200,
          processedAt: at,
          error: null,
        },
      },
    );
    const appliedReceipt = await this.receipts.findOne({ _id: receipt._id });
    const persistedEvent = await this.events.findOne({ _id: eventId });
    if (!appliedReceipt || !persistedEvent) {
      throw new Error(`Webhook transition ${receipt._id} could not be reconstructed after ordered writes.`);
    }

    return {
      receipt: toPaymentWebhookReceiptRecord(appliedReceipt),
      payment: toPaymentRecord(payment),
      event: toPaymentEventRecord(persistedEvent),
    };
  }

  async createPaymentRefund(input: CreatePaymentRefundParams): Promise<PaymentRefundRecord> {
    const document: PaymentRefundDocument = {
      _id: input.id ?? randomUUID(),
      paymentId: input.paymentId,
      providerRefundId: input.providerRefundId ?? null,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      initiatedBy: input.initiatedBy ?? null,
      providerEvidence: input.providerEvidence ?? null,
      reason: input.reason ?? null,
      createdAt: input.createdAt ?? new Date(),
      confirmedAt: input.confirmedAt ?? null,
    };
    await this.refunds.insertOne(document);
    return toPaymentRefundRecord(document);
  }

  async listPaymentRefunds(paymentId: string): Promise<PaymentRefundRecord[]> {
    const rows = await this.refunds.find({ paymentId }, { sort: { createdAt: 1, _id: 1 } }).toArray();
    return rows.map(toPaymentRefundRecord);
  }

  async claimPaymentOutbox(params: ClaimPaymentOutboxParams, publish: PaymentOutboxPublisher): Promise<number> {
    const rows = await this.events
      .find(
        {
          type: 'state_change',
          toStatus: { $in: ['paid', 'refunded'] },
          outboxPublishedAt: null,
        },
        { sort: { createdAt: 1, _id: 1 }, limit: params.count },
      )
      .toArray();
    if (rows.length === 0) {
      return 0;
    }

    await publish(rows.map(toPaymentEventRecord));
    await this.events.updateMany(
      { _id: { $in: rows.map((row) => row._id) }, outboxPublishedAt: null },
      { $set: { outboxPublishedAt: params.publishedAt } },
    );
    return rows.length;
  }

  private async observeOrderedWrite(stage: PaymentsMongoOrderedWriteStage): Promise<void> {
    await this.orderedWriteObserver?.after(stage);
  }

  private async insertOrRecoverReceipt(
    input: CreatePaymentWebhookReceiptParams,
  ): Promise<PaymentWebhookReceiptDocument> {
    const receipt = newReceiptDocument(input);
    try {
      await this.receipts.insertOne(receipt);
      return receipt;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await this.receipts.findOne({
        providerCode: input.providerCode,
        idempotencyKey: input.idempotencyKey,
      });
      if (!existing) {
        throw error;
      }
      return existing;
    }
  }
}

function assertRecoverableEvent(event: PaymentEventDocument, input: CommitWebhookPaymentTransitionParams): void {
  if (event.paymentId !== input.paymentId || event.type !== 'state_change' || event.toStatus !== input.toStatus) {
    throw new Error(`Webhook transition ${event._id} conflicts with an existing recovery event.`);
  }
}

function paymentTransitionUpdate(payment: PaymentDocument, input: CommitWebhookPaymentTransitionParams, at: Date) {
  const set: Record<string, unknown> = {
    status: input.toStatus,
    providerStatusRaw: input.providerStatusRaw ?? payment.providerStatusRaw,
    paidAmount: input.paidAmount ?? payment.paidAmount,
    paidCurrency: input.paidCurrency ?? payment.paidCurrency,
    fee: input.fee ?? payment.fee,
    partialAmount: input.partialAmount ?? payment.partialAmount,
    refundedAmount: input.refundedAmount ?? payment.refundedAmount,
    updatedAt: at,
  };
  if (input.toStatus === 'paid') {
    set['paidAt'] = at;
  } else if (input.toStatus === 'cancelled') {
    set['cancelledAt'] = at;
  } else if (input.toStatus === 'expired') {
    set['expiredAt'] = at;
  } else if (input.toStatus === 'refunded') {
    set['refundedAt'] = at;
  }
  return { $set: set, $inc: { version: 1 } };
}

function isDuplicateKeyError(error: unknown): error is MongoServerError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
