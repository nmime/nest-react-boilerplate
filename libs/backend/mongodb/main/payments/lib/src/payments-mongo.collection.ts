import type { CreateIndexesOptions, Db, Document, IndexDescription } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from '../../../shared/lib/src/migrations/mongo-migration';
import type {
  PaymentDocument,
  PaymentEventDocument,
  PaymentProviderDocument,
  PaymentProviderHealthDocument,
  PaymentRefundDocument,
  PaymentWebhookReceiptDocument,
} from './payments-mongo.types';

/* eslint-disable no-await-in-loop -- collection DDL and verification are intentionally ordered */

export const PaymentsCollectionName = 'payments';
export const PaymentEventsCollectionName = 'payment_events';
export const PaymentWebhookReceiptsCollectionName = 'payment_webhook_receipts';
export const PaymentProvidersCollectionName = 'payment_providers';
export const PaymentRefundsCollectionName = 'payment_refunds';
export const PaymentProviderHealthCollectionName = 'payment_provider_health';

export const PaymentsProviderPaymentIndexName = 'uq__payments__provider_code_provider_payment_id';
export const PaymentsStatusExpiresIndexName = 'ix__payments__status_expires_at';
export const PaymentsTenantCreatedIndexName = 'ix__payments__tenant_id_created_at_desc';
export const PaymentEventsPaymentCreatedIndexName = 'ix__payment_events__payment_id_created_at';
export const PaymentEventsOutboxIndexName = 'ix__payment_events__outbox';
export const PaymentWebhookReplayIndexName = 'uq__payment_webhook_receipts__provider_code_idempotency_key';
export const PaymentWebhookProcessingIndexName = 'ix__payment_webhook_receipts__processing_status_claimed_at';
/** Pre-U6 lease index name; the claim-lease migration drops it before reapplying definitions. */
export const PaymentWebhookProcessingLegacyIndexName = 'ix__payment_webhook_receipts__processing_status_received_at';
export const PaymentProvidersTenantIndexName = 'uq__payment_providers__code_tenant_id';
export const PaymentProvidersRoutingIndexName = 'ix__payment_providers__enabled_priority';
export const PaymentRefundsPaymentIndexName = 'ix__payment_refunds__payment_id_created_at';

const decimalStringPattern = '^\\d+(\\.\\d+)?$';
const paymentStatusEnum = ['pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded'];
const paymentEventTypeEnum = [
  'created',
  'state_change',
  'webhook_received',
  'provider_call',
  'reconcile',
  'refund',
  'manual_override',
];

const nullableString = { bsonType: ['string', 'null'] };
const nullableDate = { bsonType: ['date', 'null'] };
const nullableObject = { bsonType: ['object', 'null'] };

export const PaymentsCollectionValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'tenantId',
      'providerCode',
      'providerPaymentId',
      'status',
      'amount',
      'currency',
      'fxSnapshot',
      'providerStatusRaw',
      'paidAmount',
      'paidCurrency',
      'fee',
      'partialAmount',
      'refundedAmount',
      'meta',
      'expiresAt',
      'createdAt',
      'updatedAt',
      'paidAt',
      'cancelledAt',
      'expiredAt',
      'refundedAt',
      'version',
    ],
    properties: {
      _id: { bsonType: 'string' },
      tenantId: { bsonType: 'string' },
      providerCode: { bsonType: 'string', minLength: 1 },
      providerPaymentId: nullableString,
      status: { bsonType: 'string', enum: paymentStatusEnum },
      amount: { bsonType: 'string', pattern: decimalStringPattern },
      currency: { bsonType: 'string', minLength: 2, maxLength: 12 },
      fxSnapshot: nullableObject,
      providerStatusRaw: nullableString,
      paidAmount: { bsonType: ['string', 'null'], pattern: decimalStringPattern },
      paidCurrency: nullableString,
      fee: { bsonType: ['string', 'null'], pattern: decimalStringPattern },
      partialAmount: { bsonType: ['string', 'null'], pattern: decimalStringPattern },
      refundedAmount: { bsonType: 'string', pattern: decimalStringPattern },
      meta: { bsonType: 'object' },
      expiresAt: nullableDate,
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      paidAt: nullableDate,
      cancelledAt: nullableDate,
      expiredAt: nullableDate,
      refundedAt: nullableDate,
      version: { bsonType: 'int', minimum: 1 },
    },
  },
};

export const PaymentEventsCollectionValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'paymentId',
      'type',
      'fromStatus',
      'toStatus',
      'actor',
      'reason',
      'providerEvidence',
      'requestId',
      'outboxPublishedAt',
      'createdAt',
    ],
    properties: {
      _id: { bsonType: 'string' },
      paymentId: { bsonType: 'string' },
      type: { bsonType: 'string', enum: paymentEventTypeEnum },
      fromStatus: { bsonType: ['string', 'null'], enum: [...paymentStatusEnum, null] },
      toStatus: { bsonType: ['string', 'null'], enum: [...paymentStatusEnum, null] },
      actor: { bsonType: 'string', minLength: 1 },
      reason: nullableString,
      providerEvidence: nullableObject,
      requestId: nullableString,
      outboxPublishedAt: nullableDate,
      createdAt: { bsonType: 'date' },
    },
  },
};

export const PaymentWebhookReceiptsCollectionValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'providerCode',
      'idempotencyKey',
      'rawBody',
      'contentType',
      'signatureValid',
      'signatureKind',
      'statusCode',
      'processingStatus',
      'error',
      'requestId',
      'receivedAt',
      'claimedAt',
      'processedAt',
    ],
    properties: {
      _id: { bsonType: 'string' },
      providerCode: { bsonType: 'string', minLength: 1 },
      idempotencyKey: { bsonType: 'string', minLength: 1 },
      rawBody: { bsonType: 'string' },
      contentType: nullableString,
      signatureValid: { bsonType: 'string', enum: ['valid', 'invalid', 'none'] },
      signatureKind: nullableString,
      statusCode: { bsonType: ['int', 'null'], minimum: 100, maximum: 599 },
      processingStatus: { bsonType: 'string', enum: ['pending', 'applied', 'ignored', 'rejected', 'error'] },
      error: nullableString,
      requestId: nullableString,
      receivedAt: { bsonType: 'date' },
      claimedAt: { bsonType: 'date' },
      processedAt: nullableDate,
    },
  },
};

export const PaymentProvidersCollectionValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'code',
      'kind',
      'enabled',
      'priority',
      'tenantId',
      'supportedCurrencies',
      'config',
      'baseUrl',
      'version',
      'credentialsEncrypted',
      'timeoutMs',
      'regionAllow',
      'regionDeny',
      'createdAt',
      'updatedAt',
      'updatedBy',
    ],
    properties: {
      _id: { bsonType: 'string' },
      code: { bsonType: 'string', minLength: 1 },
      kind: { bsonType: 'string', enum: ['crypto', 'fiat'] },
      enabled: { bsonType: 'bool' },
      priority: { bsonType: 'int' },
      tenantId: nullableString,
      supportedCurrencies: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          additionalProperties: false,
          required: ['code', 'kind'],
          properties: {
            code: { bsonType: 'string', minLength: 1 },
            kind: { bsonType: 'string', enum: ['crypto', 'fiat'] },
            networks: { bsonType: 'array', items: { bsonType: 'string' } },
          },
        },
      },
      config: { bsonType: 'object' },
      baseUrl: { bsonType: 'string', minLength: 1 },
      version: { bsonType: 'string', minLength: 1 },
      credentialsEncrypted: nullableObject,
      timeoutMs: { bsonType: 'int', minimum: 1 },
      regionAllow: { bsonType: ['array', 'null'], items: { bsonType: 'string' } },
      regionDeny: { bsonType: 'array', items: { bsonType: 'string' } },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      updatedBy: nullableString,
    },
  },
};

export const PaymentRefundsCollectionValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'paymentId',
      'providerRefundId',
      'amount',
      'currency',
      'status',
      'initiatedBy',
      'providerEvidence',
      'reason',
      'createdAt',
      'confirmedAt',
    ],
    properties: {
      _id: { bsonType: 'string' },
      paymentId: { bsonType: 'string' },
      providerRefundId: nullableString,
      amount: { bsonType: 'string', pattern: decimalStringPattern },
      currency: { bsonType: 'string', minLength: 2, maxLength: 12 },
      status: { bsonType: 'string', enum: ['requested', 'confirmed', 'failed', 'manual'] },
      initiatedBy: nullableString,
      providerEvidence: nullableObject,
      reason: nullableString,
      createdAt: { bsonType: 'date' },
      confirmedAt: nullableDate,
    },
  },
};

export const PaymentProviderHealthCollectionValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'state', 'consecutiveErrors', 'lastSuccessAt', 'lastErrorAt', 'lastErrorClass', 'updatedAt'],
    properties: {
      _id: { bsonType: 'string' },
      state: { bsonType: 'string', enum: ['unknown', 'up', 'degraded', 'down', 'disabled'] },
      consecutiveErrors: { bsonType: 'int', minimum: 0 },
      lastSuccessAt: nullableDate,
      lastErrorAt: nullableDate,
      lastErrorClass: {
        bsonType: ['string', 'null'],
        enum: ['auth', 'client', 'server', 'rate_limited', 'timeout', 'network', null],
      },
      updatedAt: { bsonType: 'date' },
    },
  },
};

export const PaymentsIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  {
    name: PaymentsProviderPaymentIndexName,
    key: { providerCode: 1, providerPaymentId: 1 },
    unique: true,
    partialFilterExpression: { providerPaymentId: { $type: 'string' } },
  },
  { name: PaymentsStatusExpiresIndexName, key: { status: 1, expiresAt: 1 } },
  { name: PaymentsTenantCreatedIndexName, key: { tenantId: 1, createdAt: -1 } },
];

export const PaymentEventsIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: PaymentEventsPaymentCreatedIndexName, key: { paymentId: 1, createdAt: 1 } },
  {
    name: PaymentEventsOutboxIndexName,
    key: { type: 1, toStatus: 1, outboxPublishedAt: 1 },
    partialFilterExpression: { outboxPublishedAt: null },
  },
];

export const PaymentWebhookReceiptsIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: PaymentWebhookReplayIndexName, key: { providerCode: 1, idempotencyKey: 1 }, unique: true },
  { name: PaymentWebhookProcessingIndexName, key: { processingStatus: 1, claimedAt: 1 } },
];

export const PaymentProvidersIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: PaymentProvidersTenantIndexName, key: { code: 1, tenantId: 1 }, unique: true },
  { name: PaymentProvidersRoutingIndexName, key: { enabled: 1, priority: 1, code: 1 } },
];

export const PaymentRefundsIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: PaymentRefundsPaymentIndexName, key: { paymentId: 1, createdAt: 1 } },
];

export const PaymentProviderHealthIndexes: Array<IndexDescription & CreateIndexesOptions> = [];

export const PaymentsMongoCollectionDefinitions = [
  { name: PaymentsCollectionName, validator: PaymentsCollectionValidator, indexes: PaymentsIndexes },
  { name: PaymentEventsCollectionName, validator: PaymentEventsCollectionValidator, indexes: PaymentEventsIndexes },
  {
    name: PaymentWebhookReceiptsCollectionName,
    validator: PaymentWebhookReceiptsCollectionValidator,
    indexes: PaymentWebhookReceiptsIndexes,
  },
  {
    name: PaymentProvidersCollectionName,
    validator: PaymentProvidersCollectionValidator,
    indexes: PaymentProvidersIndexes,
  },
  { name: PaymentRefundsCollectionName, validator: PaymentRefundsCollectionValidator, indexes: PaymentRefundsIndexes },
  {
    name: PaymentProviderHealthCollectionName,
    validator: PaymentProviderHealthCollectionValidator,
    indexes: PaymentProviderHealthIndexes,
  },
] as const;

export async function initializePaymentsCollections(database: Db): Promise<void> {
  for (const definition of PaymentsMongoCollectionDefinitions) {
    await defineCollection(database, definition.name, definition.validator);
    if (definition.indexes.length > 0) {
      await database.collection(definition.name).createIndexes([...definition.indexes]);
    }
  }
}

export async function verifyPaymentsCollections(database: Db): Promise<void> {
  for (const definition of PaymentsMongoCollectionDefinitions) {
    await assertCollectionDefinition(database, definition);
  }
}

async function defineCollection(database: Db, name: string, validator: Document): Promise<void> {
  try {
    await database.createCollection(name, { validator, validationAction: 'error', validationLevel: 'strict' });
  } catch (error) {
    if (!isNamespaceExistsError(error)) {
      throw error;
    }
    await database.command({ collMod: name, validator, validationAction: 'error', validationLevel: 'strict' });
  }
}

function isNamespaceExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 48;
}

export type PaymentsMongoDocument =
  | PaymentDocument
  | PaymentEventDocument
  | PaymentWebhookReceiptDocument
  | PaymentProviderDocument
  | PaymentRefundDocument
  | PaymentProviderHealthDocument;
