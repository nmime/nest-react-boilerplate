// @requirements REQ-PAYMENT-WEBHOOK-002
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentsCollectionName,
  PaymentsCreatedAtIndexName,
  PaymentsIndexes,
  PaymentsCollectionValidator,
  initializePaymentsCollection,
  verifyPaymentsCollection,
} from './payments-mongo.collection';

const migrationMocks = vi.hoisted(() => ({
  assertCollectionDefinition: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../shared/lib/src/migrations/mongo-migration', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/lib/src/migrations/mongo-migration')>();
  return { ...original, assertCollectionDefinition: migrationMocks.assertCollectionDefinition };
});

describe('initializePaymentsCollection', () => {
  it('creates a new collection and its named index', async () => {
    const createIndexes = vi.fn().mockResolvedValue([]);
    const database = {
      createCollection: vi.fn().mockResolvedValue(undefined),
      command: vi.fn(),
      collection: vi.fn(() => ({ createIndexes })),
    };

    await initializePaymentsCollection(database as never);

    expect(database.createCollection).toHaveBeenCalledWith(
      PaymentsCollectionName,
      expect.objectContaining({ validator: PaymentsCollectionValidator, validationLevel: 'strict' }),
    );
    expect(database.command).not.toHaveBeenCalled();
    expect(createIndexes).toHaveBeenCalledWith(PaymentsIndexes);
  });

  it('reconciles an existing collection and creates the named index idempotently', async () => {
    const createIndexes = vi.fn().mockResolvedValue([]);
    const database = {
      createCollection: vi.fn().mockRejectedValue({ code: 48 }),
      command: vi.fn().mockResolvedValue({ ok: 1 }),
      collection: vi.fn(() => ({ createIndexes })),
    };

    await initializePaymentsCollection(database as never);

    expect(database.command).toHaveBeenCalledWith(
      expect.objectContaining({ collMod: PaymentsCollectionName, validator: PaymentsCollectionValidator }),
    );
    expect(createIndexes).toHaveBeenCalledWith([expect.objectContaining({ name: PaymentsCreatedAtIndexName })]);
  });

  it('rethrows a namespace error that is not namespace-exists', async () => {
    const database = {
      createCollection: vi.fn().mockRejectedValue('boom'),
      command: vi.fn(),
      collection: vi.fn(),
    };

    await expect(initializePaymentsCollection(database as never)).rejects.toBe('boom');
    expect(database.command).not.toHaveBeenCalled();
  });

  it('rethrows an object error without a code', async () => {
    const error = Object.assign(new Error('locked'), {});
    const database = {
      createCollection: vi.fn().mockRejectedValue(error),
      command: vi.fn(),
      collection: vi.fn(),
    };

    await expect(initializePaymentsCollection(database as never)).rejects.toBe(error);
  });

  it('rethrows an object error whose code is not namespace-exists', async () => {
    const error = { code: 1, message: 'unavailable' };
    const database = {
      createCollection: vi.fn().mockRejectedValue(error),
      command: vi.fn(),
      collection: vi.fn(),
    };

    await expect(initializePaymentsCollection(database as never)).rejects.toBe(error);
  });
});

describe('verifyPaymentsCollection', () => {
  it('asserts the collection definition against the live database', async () => {
    await verifyPaymentsCollection({} as never);

    expect(migrationMocks.assertCollectionDefinition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: PaymentsCollectionName, indexes: PaymentsIndexes }),
    );
  });
});
