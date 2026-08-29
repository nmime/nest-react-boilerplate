// @requirements REQ-PAYMENT-WEBHOOK-002
import { describe, expect, it, vi } from 'vitest';
import {
  PaymentWebhookProcessingLegacyIndexName,
  PaymentWebhookReceiptsCollectionName,
} from '../payments-mongo.collection';
import { Migration20260827100000AddPaymentWebhookClaimLease } from './Migration20260827100000AddPaymentWebhookClaimLease';

const collectionMocks = vi.hoisted(() => ({
  initializePaymentsCollections: vi.fn(() => Promise.resolve()),
  verifyPaymentsCollections: vi.fn(() => Promise.resolve()),
}));

vi.mock('../payments-mongo.collection', async (importOriginal) => {
  const original = await importOriginal<typeof import('../payments-mongo.collection')>();
  return { ...original, ...collectionMocks };
});

function database(dropIndex = vi.fn().mockResolvedValue(undefined)) {
  const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  return {
    database: {
      collection: vi.fn((name: string) => ({ collectionName: name, dropIndex, updateMany })),
    },
    dropIndex,
    updateMany,
  };
}

describe('Migration20260827100000AddPaymentWebhookClaimLease', () => {
  it('backfills receivedAt, replaces the old index, and reapplies strict definitions', async () => {
    const fixture = database();

    await Migration20260827100000AddPaymentWebhookClaimLease.up(fixture.database as never);

    expect(fixture.database.collection).toHaveBeenCalledWith(PaymentWebhookReceiptsCollectionName);
    expect(fixture.updateMany).toHaveBeenCalledWith(
      { claimedAt: { $exists: false } },
      [{ $set: { claimedAt: '$receivedAt' } }],
      { writeConcern: { w: 'majority' } },
    );
    expect(fixture.dropIndex).toHaveBeenCalledWith(PaymentWebhookProcessingLegacyIndexName);
    expect(collectionMocks.initializePaymentsCollections).toHaveBeenCalledWith(fixture.database);
  });

  it.each([{ code: 27 }, { code: 'IndexNotFound' }])('tolerates a missing legacy index %#', async (error) => {
    const fixture = database(vi.fn().mockRejectedValue(error));

    await expect(
      Migration20260827100000AddPaymentWebhookClaimLease.up(fixture.database as never),
    ).resolves.toBeUndefined();
  });

  it.each(['boom', new Error('locked'), { code: 1 }])('propagates non-missing-index failure %#', async (error) => {
    const fixture = database(vi.fn().mockRejectedValue(error));

    await expect(Migration20260827100000AddPaymentWebhookClaimLease.up(fixture.database as never)).rejects.toBe(error);
  });

  it('verifies the reconciled collection definitions', async () => {
    const fixture = database();

    await Migration20260827100000AddPaymentWebhookClaimLease.verify(fixture.database as never);

    expect(collectionMocks.verifyPaymentsCollections).toHaveBeenCalledWith(fixture.database);
  });
});
