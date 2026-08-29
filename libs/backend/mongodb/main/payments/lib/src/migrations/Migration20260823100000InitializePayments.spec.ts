// @requirements REQ-PAYMENT-ORDER-003
import { describe, expect, it, vi } from 'vitest';
import { Migration20260823100000InitializePayments } from './Migration20260823100000InitializePayments';
import { Migration20260827100000AddPaymentWebhookClaimLease } from './Migration20260827100000AddPaymentWebhookClaimLease';
import { paymentsMongoMigrations } from './index';

const collectionMocks = vi.hoisted(() => ({
  initializePaymentsCollections: vi.fn(() => Promise.resolve()),
  verifyPaymentsCollections: vi.fn(() => Promise.resolve()),
}));

vi.mock('../payments-mongo.collection', async (importOriginal) => {
  const original = await importOriginal<typeof import('../payments-mongo.collection')>();
  return {
    ...original,
    initializePaymentsCollections: collectionMocks.initializePaymentsCollections,
    verifyPaymentsCollections: collectionMocks.verifyPaymentsCollections,
  };
});

describe('Migration20260823100000InitializePayments', () => {
  it('declares the stable migration id, name, and exported ordering', () => {
    expect(Migration20260823100000InitializePayments.id).toBe('20260823100000_initialize_payments');
    expect(Migration20260823100000InitializePayments.name).toBe('InitializePayments');
    expect(paymentsMongoMigrations).toEqual([
      Migration20260823100000InitializePayments,
      Migration20260827100000AddPaymentWebhookClaimLease,
    ]);
  });

  it('up() initializes all payment collections', async () => {
    await Migration20260823100000InitializePayments.up({} as never);

    expect(collectionMocks.initializePaymentsCollections).toHaveBeenCalledOnce();
  });

  it('verify() asserts all collection definitions', async () => {
    await Migration20260823100000InitializePayments.verify({} as never);

    expect(collectionMocks.verifyPaymentsCollections).toHaveBeenCalledOnce();
  });
});
