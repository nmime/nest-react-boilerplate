import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  CreatePaymentWebhookReceiptParams,
  PaymentWebhookProcessingStatus,
  PaymentWebhookSignatureValidity,
} from '@app/backend-feature-payments-shared';

export class PaymentWebhookReceiptEntity {
  id: string = randomUUID();
  providerCode!: string;
  idempotencyKey!: string;
  rawBody!: string;
  contentType: string | null = null;
  signatureValid!: PaymentWebhookSignatureValidity;
  signatureKind: string | null = null;
  statusCode: number | null = null;
  processingStatus: PaymentWebhookProcessingStatus = 'pending';
  error: string | null = null;
  requestId: string | null = null;
  receivedAt: Date = new Date();
  processedAt: Date | null = null;

  constructor(input?: CreatePaymentWebhookReceiptParams) {
    if (!input) {
      return;
    }
    this.id = input.id ?? randomUUID();
    this.providerCode = input.providerCode;
    this.idempotencyKey = input.idempotencyKey;
    this.rawBody = input.rawBody;
    this.contentType = input.contentType ?? null;
    this.signatureValid = input.signatureValid;
    this.signatureKind = input.signatureKind ?? null;
    this.statusCode = input.statusCode ?? null;
    this.processingStatus = input.processingStatus ?? 'pending';
    this.error = input.error ?? null;
    this.requestId = input.requestId ?? null;
    this.receivedAt = input.receivedAt ?? new Date();
    this.processedAt = input.processedAt ?? null;
  }
}

export const PaymentWebhookReceiptEntitySchema = new EntitySchema<PaymentWebhookReceiptEntity>({
  class: PaymentWebhookReceiptEntity,
  tableName: 'payment_webhook_receipts',
  properties: {
    id: { type: 'uuid', primary: true },
    providerCode: { type: 'text', fieldName: 'provider_code' },
    idempotencyKey: { type: 'text', fieldName: 'idempotency_key' },
    rawBody: { type: 'text', fieldName: 'raw_body' },
    contentType: { type: 'text', fieldName: 'content_type', nullable: true },
    signatureValid: { type: 'text', fieldName: 'signature_valid' },
    signatureKind: { type: 'text', fieldName: 'signature_kind', nullable: true },
    statusCode: { type: 'integer', fieldName: 'status_code', nullable: true },
    processingStatus: { type: 'text', fieldName: 'processing_status', default: 'pending' },
    error: { type: 'text', nullable: true },
    requestId: { type: 'text', fieldName: 'request_id', nullable: true },
    receivedAt: { type: 'timestamptz', fieldName: 'received_at', onCreate: () => new Date() },
    processedAt: { type: 'timestamptz', fieldName: 'processed_at', nullable: true },
  },
  uniques: [
    {
      name: 'uq__payment_webhook_receipts__provider_code_idempotency_key',
      properties: ['providerCode', 'idempotencyKey'],
    },
  ],
});
