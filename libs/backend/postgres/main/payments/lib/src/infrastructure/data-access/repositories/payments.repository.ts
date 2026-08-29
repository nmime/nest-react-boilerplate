import { randomUUID } from 'node:crypto';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  type ClaimPaymentOutboxParams,
  type CommittedWebhookPaymentTransition,
  type CommitWebhookPaymentTransitionParams,
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
} from '@app/backend-feature-payments-shared';
import {
  PaymentEntity,
  PaymentEventEntity,
  PaymentProviderEntity,
  PaymentProviderHealthEntity,
  PaymentRefundEntity,
  PaymentWebhookReceiptEntity,
} from '../entities';

function toScaffoldPaymentsDto(entity: PaymentEntity): PaymentsDto {
  return {
    id: entity.id,
    name: typeof entity.meta['name'] === 'string' ? entity.meta['name'] : entity.id,
    createdAt: entity.createdAt.toISOString(),
  };
}

function toPaymentRecord(entity: PaymentEntity): PaymentRecord {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    providerCode: entity.providerCode,
    providerPaymentId: entity.providerPaymentId,
    status: entity.status,
    amount: entity.amount,
    currency: entity.currency,
    fxSnapshot: entity.fxSnapshot,
    providerStatusRaw: entity.providerStatusRaw,
    paidAmount: entity.paidAmount,
    paidCurrency: entity.paidCurrency,
    fee: entity.fee,
    partialAmount: entity.partialAmount,
    refundedAmount: entity.refundedAmount,
    meta: entity.meta,
    expiresAt: entity.expiresAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    paidAt: entity.paidAt,
    cancelledAt: entity.cancelledAt,
    expiredAt: entity.expiredAt,
    refundedAt: entity.refundedAt,
    version: entity.version,
  };
}

function toPaymentEventRecord(entity: PaymentEventEntity): PaymentEventRecord {
  const numericId = Number(entity.id);
  return {
    ...(Number.isSafeInteger(numericId) ? { id: numericId } : {}),
    paymentId: entity.paymentId,
    type: entity.type,
    fromStatus: entity.fromStatus,
    toStatus: entity.toStatus,
    actor: entity.actor,
    reason: entity.reason,
    providerEvidence: entity.providerEvidence,
    requestId: entity.requestId,
    outboxPublishedAt: entity.outboxPublishedAt,
    createdAt: entity.createdAt,
  };
}

function toPaymentProviderRecord(entity: PaymentProviderEntity): PaymentProviderRecord {
  return {
    id: entity.id,
    code: entity.code,
    kind: entity.kind,
    enabled: entity.enabled,
    priority: entity.priority,
    tenantId: entity.tenantId,
    supportedCurrencies: entity.supportedCurrencies,
    config: entity.config,
    baseUrl: entity.baseUrl,
    version: entity.version,
    credentialsEncrypted: entity.credentialsEncrypted,
    timeoutMs: entity.timeoutMs,
    regionAllow: entity.regionAllow,
    regionDeny: entity.regionDeny,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    updatedBy: entity.updatedBy,
  };
}

function toPaymentProviderHealthRecord(entity: PaymentProviderHealthEntity): PaymentProviderHealthRecord {
  return {
    providerCode: entity.providerCode,
    state: entity.state,
    consecutiveErrors: entity.consecutiveErrors,
    lastSuccessAt: entity.lastSuccessAt,
    lastErrorAt: entity.lastErrorAt,
    lastErrorClass: entity.lastErrorClass,
    updatedAt: entity.updatedAt,
  };
}

function toPaymentWebhookReceiptRecord(entity: PaymentWebhookReceiptEntity): PaymentWebhookReceiptRecord {
  return {
    id: entity.id,
    providerCode: entity.providerCode,
    idempotencyKey: entity.idempotencyKey,
    rawBody: entity.rawBody,
    contentType: entity.contentType,
    signatureValid: entity.signatureValid,
    signatureKind: entity.signatureKind,
    statusCode: entity.statusCode,
    processingStatus: entity.processingStatus,
    error: entity.error,
    requestId: entity.requestId,
    receivedAt: entity.receivedAt,
    claimedAt: entity.claimedAt,
    processedAt: entity.processedAt,
  };
}

function toPaymentRefundRecord(entity: PaymentRefundEntity): PaymentRefundRecord {
  return {
    id: entity.id,
    paymentId: entity.paymentId,
    providerRefundId: entity.providerRefundId,
    amount: entity.amount,
    currency: entity.currency,
    status: entity.status,
    initiatedBy: entity.initiatedBy,
    providerEvidence: entity.providerEvidence,
    reason: entity.reason,
    createdAt: entity.createdAt,
    confirmedAt: entity.confirmedAt,
  };
}

function applyPaymentTransition(payment: PaymentEntity, input: CommitWebhookPaymentTransitionParams, at: Date): void {
  payment.status = input.toStatus;
  payment.providerStatusRaw = input.providerStatusRaw ?? payment.providerStatusRaw;
  payment.paidAmount = input.paidAmount ?? payment.paidAmount;
  payment.paidCurrency = input.paidCurrency ?? payment.paidCurrency;
  payment.fee = input.fee ?? payment.fee;
  payment.partialAmount = input.partialAmount ?? payment.partialAmount;
  payment.refundedAmount = input.refundedAmount ?? payment.refundedAmount;
  payment.updatedAt = at;
  payment.version += 1;

  if (input.toStatus === 'paid') {
    payment.paidAt = at;
  } else if (input.toStatus === 'cancelled') {
    payment.cancelledAt = at;
  } else if (input.toStatus === 'expired') {
    payment.expiredAt = at;
  } else if (input.toStatus === 'refunded') {
    payment.refundedAt = at;
  }
}

/** PostgreSQL implementation of the storage-neutral payments port. */
@Injectable()
export class PaymentsPostgresPersistence extends PaymentsPersistence {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {
    super();
  }

  async listPayments(): Promise<PaymentsDto[]> {
    const rows = await this.entityManager.find(PaymentEntity, {}, { orderBy: { createdAt: 'DESC' } });
    return rows.map(toScaffoldPaymentsDto);
  }

  async createPayment(input: CreatePaymentsDto): Promise<PaymentsDto> {
    const paymentId = randomUUID();
    const record = await this.createPaymentRecord({
      id: paymentId,
      tenantId: '00000000-0000-0000-0000-000000000000',
      providerCode: 'scaffold',
      amount: '0',
      currency: 'XXX',
      meta: { name: input.name },
    });
    const entity = Object.assign(new PaymentEntity(), record);
    return toScaffoldPaymentsDto(entity);
  }

  async findPayment(id: string): Promise<PaymentsDto | null> {
    const row = await this.entityManager.findOne(PaymentEntity, { id });
    return row ? toScaffoldPaymentsDto(row) : null;
  }

  async listPaymentRecords(tenantId: string): Promise<PaymentRecord[]> {
    const rows = await this.entityManager.find(PaymentEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } });
    return rows.map(toPaymentRecord);
  }

  async createPaymentRecord(input: CreatePaymentRecordParams): Promise<PaymentRecord> {
    return this.entityManager.transactional(async (em) => {
      const payment = new PaymentEntity(input);
      const createdEvent = new PaymentEventEntity({
        paymentId: payment.id,
        type: 'created',
        fromStatus: null,
        toStatus: payment.status,
        actor: 'system',
        providerEvidence: null,
        createdAt: payment.createdAt,
      });
      em.persist(payment);
      await em.flush();
      em.persist(createdEvent);
      await em.flush();
      return toPaymentRecord(payment);
    });
  }

  async findPaymentRecord(id: string): Promise<PaymentRecord | null> {
    const row = await this.entityManager.findOne(PaymentEntity, { id });
    return row ? toPaymentRecord(row) : null;
  }

  async findPaymentRecordByProviderReference(
    providerCode: string,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null> {
    const row = await this.entityManager.findOne(PaymentEntity, { providerCode, providerPaymentId });
    return row ? toPaymentRecord(row) : null;
  }

  async appendPaymentEvent(input: CreatePaymentEventParams): Promise<PaymentEventRecord> {
    const event = new PaymentEventEntity(input);
    this.entityManager.persist(event);
    await this.entityManager.flush();
    return toPaymentEventRecord(event);
  }

  async listPaymentEvents(paymentId: string): Promise<PaymentEventRecord[]> {
    const rows = await this.entityManager.find(PaymentEventEntity, { paymentId }, { orderBy: { createdAt: 'ASC' } });
    return rows.map(toPaymentEventRecord);
  }

  async listPaymentProviders(tenantId?: string): Promise<PaymentProviderRecord[]> {
    const where = tenantId === undefined ? {} : { $or: [{ tenantId }, { tenantId: null }] };
    const rows = await this.entityManager.find(PaymentProviderEntity, where, {
      orderBy: { priority: 'ASC', code: 'ASC' },
    });
    return rows.map(toPaymentProviderRecord);
  }

  async findPaymentProvider(code: string, tenantId?: string): Promise<PaymentProviderRecord | null> {
    if (tenantId !== undefined) {
      const tenant = await this.entityManager.findOne(PaymentProviderEntity, { code, tenantId });
      if (tenant) {
        return toPaymentProviderRecord(tenant);
      }
    }
    const platform = await this.entityManager.findOne(PaymentProviderEntity, { code, tenantId: null });
    return platform ? toPaymentProviderRecord(platform) : null;
  }

  async upsertPaymentProvider(input: UpsertPaymentProviderParams): Promise<PaymentProviderRecord> {
    const existing = await this.entityManager.findOne(PaymentProviderEntity, {
      code: input.code,
      tenantId: input.tenantId ?? null,
    });
    const provider = existing ?? new PaymentProviderEntity(input);
    provider.kind = input.kind;
    provider.enabled = input.enabled ?? provider.enabled;
    provider.priority = input.priority ?? provider.priority;
    provider.supportedCurrencies = input.supportedCurrencies ?? provider.supportedCurrencies;
    provider.config = input.config ?? provider.config;
    provider.baseUrl = input.baseUrl;
    provider.version = input.version;
    provider.credentialsEncrypted =
      input.credentialsEncrypted === undefined ? provider.credentialsEncrypted : input.credentialsEncrypted;
    provider.timeoutMs = input.timeoutMs ?? provider.timeoutMs;
    provider.regionAllow = input.regionAllow === undefined ? provider.regionAllow : input.regionAllow;
    provider.regionDeny = input.regionDeny ?? provider.regionDeny;
    provider.updatedBy = input.updatedBy === undefined ? provider.updatedBy : input.updatedBy;
    provider.updatedAt = new Date();
    if (!existing) {
      this.entityManager.persist(provider);
    }
    await this.entityManager.flush();
    return toPaymentProviderRecord(provider);
  }

  async findPaymentProviderHealth(providerCode: string): Promise<PaymentProviderHealthRecord | null> {
    const row = await this.entityManager.findOne(PaymentProviderHealthEntity, { providerCode });
    return row ? toPaymentProviderHealthRecord(row) : null;
  }

  async upsertPaymentProviderHealth(input: UpsertPaymentProviderHealthParams): Promise<PaymentProviderHealthRecord> {
    const existing = await this.entityManager.findOne(PaymentProviderHealthEntity, {
      providerCode: input.providerCode,
    });
    const health = existing ?? new PaymentProviderHealthEntity(input);
    health.state = input.state;
    health.consecutiveErrors = input.consecutiveErrors;
    health.lastSuccessAt = input.lastSuccessAt === undefined ? health.lastSuccessAt : input.lastSuccessAt;
    health.lastErrorAt = input.lastErrorAt === undefined ? health.lastErrorAt : input.lastErrorAt;
    health.lastErrorClass = input.lastErrorClass === undefined ? health.lastErrorClass : input.lastErrorClass;
    health.updatedAt = input.updatedAt ?? new Date();
    if (!existing) {
      this.entityManager.persist(health);
    }
    await this.entityManager.flush();
    return toPaymentProviderHealthRecord(health);
  }

  async findWebhookReceipt(providerCode: string, idempotencyKey: string): Promise<PaymentWebhookReceiptRecord | null> {
    const row = await this.entityManager.findOne(PaymentWebhookReceiptEntity, { providerCode, idempotencyKey });
    return row ? toPaymentWebhookReceiptRecord(row) : null;
  }

  async claimWebhookReceipt(
    input: CreatePaymentWebhookReceiptParams,
    inflightBefore: Date,
  ): Promise<PaymentWebhookReceiptClaimOutcome> {
    return this.entityManager.transactional(
      async (em) => {
        const claimedAt = input.claimedAt ?? input.receivedAt ?? new Date();
        const candidate = new PaymentWebhookReceiptEntity({ ...input, claimedAt });
        const inserted = await em.getConnection().execute<{ id: string }[]>(
          `insert into "payment_webhook_receipts" (
             "id", "provider_code", "idempotency_key", "raw_body", "content_type",
             "signature_valid", "signature_kind", "status_code", "processing_status",
             "error", "request_id", "received_at", "claimed_at", "processed_at"
           ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           on conflict ("provider_code", "idempotency_key") do nothing
           returning "id"`,
          [
            candidate.id,
            candidate.providerCode,
            candidate.idempotencyKey,
            candidate.rawBody,
            candidate.contentType,
            candidate.signatureValid,
            candidate.signatureKind,
            candidate.statusCode,
            candidate.processingStatus,
            candidate.error,
            candidate.requestId,
            candidate.receivedAt,
            candidate.claimedAt,
            candidate.processedAt,
          ],
          'all',
        );
        if (inserted.length === 1) {
          return { kind: 'claimed', receipt: toPaymentWebhookReceiptRecord(candidate) };
        }
        const existing = await em.findOne(
          PaymentWebhookReceiptEntity,
          { providerCode: input.providerCode, idempotencyKey: input.idempotencyKey },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!existing) {
          throw new Error('Webhook receipt conflict winner is not visible.');
        }
        if (existing.processingStatus === 'applied' || existing.processingStatus === 'ignored') {
          return { kind: 'finalized', receipt: toPaymentWebhookReceiptRecord(existing) };
        }
        if (existing.processingStatus === 'pending' && existing.claimedAt > inflightBefore) {
          return { kind: 'inflight', receipt: toPaymentWebhookReceiptRecord(existing) };
        }
        existing.processingStatus = 'pending';
        existing.statusCode = null;
        existing.error = null;
        existing.processedAt = null;
        existing.claimedAt = claimedAt;
        await em.flush();
        return { kind: 'resumable', receipt: toPaymentWebhookReceiptRecord(existing) };
      },
      { propagation: 'required', isolationLevel: 'read committed', clear: true },
    );
  }

  async insertWebhookReceipt(input: CreatePaymentWebhookReceiptParams): Promise<PaymentWebhookReceiptRecord> {
    const receipt = new PaymentWebhookReceiptEntity(input);
    this.entityManager.persist(receipt);
    await this.entityManager.flush();
    return toPaymentWebhookReceiptRecord(receipt);
  }

  async updateWebhookReceipt(
    id: string,
    input: UpdatePaymentWebhookReceiptParams,
  ): Promise<PaymentWebhookReceiptRecord> {
    const receipt = await this.entityManager.findOne(PaymentWebhookReceiptEntity, { id });
    if (!receipt) {
      throw new Error(`Webhook receipt ${id} does not exist.`);
    }
    if (input.processingStatus !== undefined) {
      receipt.processingStatus = input.processingStatus;
    }
    if (input.statusCode !== undefined) {
      receipt.statusCode = input.statusCode;
    }
    if (input.error !== undefined) {
      receipt.error = input.error;
    }
    if (input.processedAt !== undefined) {
      receipt.processedAt = input.processedAt;
    }
    await this.entityManager.flush();
    return toPaymentWebhookReceiptRecord(receipt);
  }

  async commitWebhookPaymentTransition(
    input: CommitWebhookPaymentTransitionParams,
  ): Promise<CommittedWebhookPaymentTransition> {
    return this.entityManager.transactional(async (em) => {
      let receipt = await em.findOne(
        PaymentWebhookReceiptEntity,
        { id: input.receipt.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!receipt) {
        receipt = new PaymentWebhookReceiptEntity(input.receipt);
        em.persist(receipt);
        await em.flush();
      }

      const payment = await em.findOne(
        PaymentEntity,
        { id: input.paymentId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!payment) {
        throw new Error(`Payment ${input.paymentId} does not exist.`);
      }

      const at = input.transitionedAt ?? new Date();
      const event = new PaymentEventEntity({
        paymentId: payment.id,
        type: 'state_change',
        fromStatus: payment.status,
        toStatus: input.toStatus,
        actor: input.actor,
        reason: input.reason ?? null,
        providerEvidence: input.providerEvidence ?? null,
        requestId: input.requestId ?? input.receipt.requestId ?? null,
        createdAt: at,
      });
      em.persist(event);
      applyPaymentTransition(payment, input, at);
      receipt.processingStatus = 'applied';
      receipt.statusCode = input.statusCode ?? 200;
      receipt.error = null;
      receipt.processedAt = at;
      await em.flush();

      return {
        receipt: toPaymentWebhookReceiptRecord(receipt),
        payment: toPaymentRecord(payment),
        event: toPaymentEventRecord(event),
      };
    });
  }

  async createPaymentRefund(input: CreatePaymentRefundParams): Promise<PaymentRefundRecord> {
    const refund = new PaymentRefundEntity(input);
    this.entityManager.persist(refund);
    await this.entityManager.flush();
    return toPaymentRefundRecord(refund);
  }

  async listPaymentRefunds(paymentId: string): Promise<PaymentRefundRecord[]> {
    const rows = await this.entityManager.find(PaymentRefundEntity, { paymentId }, { orderBy: { createdAt: 'ASC' } });
    return rows.map(toPaymentRefundRecord);
  }

  async claimPaymentOutbox(params: ClaimPaymentOutboxParams, publish: PaymentOutboxPublisher): Promise<number> {
    return this.entityManager.transactional(async (em) => {
      const events = await em.find(
        PaymentEventEntity,
        {
          type: 'state_change',
          toStatus: { $in: ['paid', 'refunded'] },
          outboxPublishedAt: null,
        },
        {
          limit: params.count,
          orderBy: { createdAt: 'ASC', id: 'ASC' },
          lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
        },
      );
      if (events.length === 0) {
        return 0;
      }

      await publish(events.map(toPaymentEventRecord));
      for (const event of events) {
        event.outboxPublishedAt = params.publishedAt;
      }
      await em.flush();
      return events.length;
    });
  }
}
