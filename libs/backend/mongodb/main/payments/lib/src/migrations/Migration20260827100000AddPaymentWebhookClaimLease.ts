import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import {
  PaymentWebhookProcessingLegacyIndexName,
  PaymentWebhookReceiptsCollectionName,
  initializePaymentsCollections,
  verifyPaymentsCollections,
} from '../payments-mongo.collection';

export const Migration20260827100000AddPaymentWebhookClaimLease: MongoMigration = {
  id: '20260827100000_add_payment_webhook_claim_lease',
  name: 'AddPaymentWebhookClaimLease',

  async up(database: Db): Promise<void> {
    const receipts = database.collection(PaymentWebhookReceiptsCollectionName);
    await receipts.updateMany({ claimedAt: { $exists: false } }, [{ $set: { claimedAt: '$receivedAt' } }], {
      writeConcern: { w: 'majority' },
    });
    await receipts.dropIndex(PaymentWebhookProcessingLegacyIndexName).catch((error: unknown) => {
      if (!isMissingIndexError(error)) {
        throw error;
      }
    });
    await initializePaymentsCollections(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyPaymentsCollections(database);
  },
};

function isMissingIndexError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code: unknown = Reflect.get(error, 'code');
  return code === 27 || code === 'IndexNotFound';
}
