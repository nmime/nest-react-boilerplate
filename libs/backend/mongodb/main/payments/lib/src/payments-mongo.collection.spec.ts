// @requirements REQ-PAYMENT-WEBHOOK-002
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentEventsCollectionName,
  PaymentEventsOutboxIndexName,
  PaymentProviderHealthCollectionName,
  PaymentProvidersCollectionName,
  PaymentRefundsCollectionName,
  PaymentsCollectionName,
  PaymentsCollectionValidator,
  PaymentsMongoCollectionDefinitions,
  PaymentWebhookReceiptsCollectionName,
  PaymentWebhookReplayIndexName,
  initializePaymentsCollections,
  verifyPaymentsCollections,
} from './payments-mongo.collection';

const migrationMocks = vi.hoisted(() => ({
  assertCollectionDefinition: vi.fn((_database: unknown, _definition: { name: string }) => Promise.resolve()),
}));

vi.mock('../../../shared/lib/src/migrations/mongo-migration', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/lib/src/migrations/mongo-migration')>();
  return { ...original, assertCollectionDefinition: migrationMocks.assertCollectionDefinition };
});

function createDatabase(createCollection = vi.fn().mockResolvedValue(undefined)) {
  const createIndexes = vi.fn().mockResolvedValue([]);
  const database = {
    createCollection,
    command: vi.fn().mockResolvedValue({ ok: 1 }),
    collection: vi.fn((name: string) => ({ name, createIndexes })),
  };
  return { createIndexes, database };
}

describe('payments MongoDB collections', () => {
  it('declares all six strict collections and the replay/outbox indexes', () => {
    expect(PaymentsMongoCollectionDefinitions.map(({ name }) => name)).toEqual([
      PaymentsCollectionName,
      PaymentEventsCollectionName,
      PaymentWebhookReceiptsCollectionName,
      PaymentProvidersCollectionName,
      PaymentRefundsCollectionName,
      PaymentProviderHealthCollectionName,
    ]);
    expect(PaymentsCollectionValidator).toMatchObject({
      $jsonSchema: {
        required: expect.arrayContaining(['status', 'amount', 'tenantId', 'providerCode']),
        properties: {
          status: { enum: ['pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded'] },
          amount: { pattern: '^\\d+(\\.\\d+)?$' },
        },
      },
    });
    expect(
      PaymentsMongoCollectionDefinitions.find(({ name }) => name === PaymentWebhookReceiptsCollectionName)?.indexes,
    ).toContainEqual(
      expect.objectContaining({
        name: PaymentWebhookReplayIndexName,
        key: { providerCode: 1, idempotencyKey: 1 },
        unique: true,
      }),
    );
    expect(
      PaymentsMongoCollectionDefinitions.find(({ name }) => name === PaymentEventsCollectionName)?.indexes,
    ).toContainEqual(expect.objectContaining({ name: PaymentEventsOutboxIndexName }));
  });

  it('creates every collection and its indexes in design order', async () => {
    const { createIndexes, database } = createDatabase();

    await initializePaymentsCollections(database as never);

    expect(database.createCollection).toHaveBeenCalledTimes(6);
    expect(database.createCollection).toHaveBeenNthCalledWith(
      1,
      PaymentsCollectionName,
      expect.objectContaining({ validator: PaymentsCollectionValidator, validationLevel: 'strict' }),
    );
    expect(database.collection.mock.calls.map(([name]) => name)).toEqual([
      PaymentsCollectionName,
      PaymentEventsCollectionName,
      PaymentWebhookReceiptsCollectionName,
      PaymentProvidersCollectionName,
      PaymentRefundsCollectionName,
    ]);
    expect(createIndexes).toHaveBeenCalledTimes(5);
  });

  it('reconciles an existing collection validator and continues', async () => {
    const createCollection = vi.fn().mockRejectedValueOnce({ code: 48 }).mockResolvedValue(undefined);
    const { database } = createDatabase(createCollection);

    await initializePaymentsCollections(database as never);

    expect(database.command).toHaveBeenCalledWith(
      expect.objectContaining({ collMod: PaymentsCollectionName, validator: PaymentsCollectionValidator }),
    );
  });

  it.each([
    ['string error', 'boom'],
    ['object without code', new Error('locked')],
    ['other code', { code: 1 }],
  ])('rethrows %s during collection creation', async (_label, error) => {
    const { database } = createDatabase(vi.fn().mockRejectedValue(error));

    await expect(initializePaymentsCollections(database as never)).rejects.toBe(error);
  });

  it('verifies every live collection definition', async () => {
    const database = {} as never;

    await verifyPaymentsCollections(database);

    expect(migrationMocks.assertCollectionDefinition).toHaveBeenCalledTimes(6);
    expect(migrationMocks.assertCollectionDefinition.mock.calls.map(([, definition]) => definition.name)).toEqual(
      PaymentsMongoCollectionDefinitions.map(({ name }) => name),
    );
  });
});
