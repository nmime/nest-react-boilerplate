// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it, vi } from 'vitest';
import { Migration20260823100000InitializePayments } from './Migration20260823100000InitializePayments';
import { paymentsMongoMigrations } from './index';

const collectionMocks = vi.hoisted(() => ({
  initializePaymentsCollection: vi.fn(() => Promise.resolve()),
  verifyPaymentsCollection: vi.fn(() => Promise.resolve()),
}));

vi.mock('../payments-mongo.collection', async (importOriginal) => {
  const original = await importOriginal<typeof import('../payments-mongo.collection')>();
  return {
    ...original,
    initializePaymentsCollection: collectionMocks.initializePaymentsCollection,
    verifyPaymentsCollection: collectionMocks.verifyPaymentsCollection,
  };
});

describe('Migration20260823100000InitializePayments', () => {
  it('declares the stable migration id and name', () => {
    expect(Migration20260823100000InitializePayments.id).toBe('20260823100000_initialize_payments');
    expect(Migration20260823100000InitializePayments.name).toBe('InitializePayments');
    expect(paymentsMongoMigrations).toEqual([Migration20260823100000InitializePayments]);
  });

  it('up() initializes the collection', async () => {
    await Migration20260823100000InitializePayments.up({} as never);

    expect(collectionMocks.initializePaymentsCollection).toHaveBeenCalledOnce();
  });

  it('verify() asserts the collection definition', async () => {
    await Migration20260823100000InitializePayments.verify({} as never);

    expect(collectionMocks.verifyPaymentsCollection).toHaveBeenCalledOnce();
  });
});
