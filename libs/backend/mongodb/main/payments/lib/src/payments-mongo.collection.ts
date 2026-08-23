import type { CreateIndexesOptions, Db, IndexDescription } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from '../../../shared/lib/src/migrations/mongo-migration';
import type { PaymentsDocument } from './payments-mongo.types';

export const PaymentsCollectionName = 'payments';
export const PaymentsCreatedAtIndexName = 'ix__payments__created_at_id';

export const PaymentsCollectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'name', 'createdAt'],
    properties: {
      _id: { bsonType: 'string' },
      name: { bsonType: 'string', minLength: 1, maxLength: 255 },
      createdAt: { bsonType: 'date' },
    },
  },
} as const;

export const PaymentsIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: PaymentsCreatedAtIndexName, key: { createdAt: -1, _id: 1 } },
];

/**
 * Scaffold collection bootstrap. U4 replaces the scaffold document shape with the payments
 * domain (providers, payments, events, webhook receipts, refunds, provider health) and
 * documents the no-transaction, ordered-write pattern this axis ships with.
 */
export async function initializePaymentsCollection(database: Db): Promise<void> {
  let existed = false;
  try {
    await database.createCollection<PaymentsDocument>(PaymentsCollectionName, {
      validator: PaymentsCollectionValidator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
  } catch (error) {
    if (!isNamespaceExistsError(error)) {
      throw error;
    }
    existed = true;
  }

  if (existed) {
    await database.command({
      collMod: PaymentsCollectionName,
      validator: PaymentsCollectionValidator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
  }
  await database.collection<PaymentsDocument>(PaymentsCollectionName).createIndexes(PaymentsIndexes);
}

export async function verifyPaymentsCollection(database: Db): Promise<void> {
  await assertCollectionDefinition(database, {
    name: PaymentsCollectionName,
    validator: PaymentsCollectionValidator,
    indexes: PaymentsIndexes,
  });
}

function isNamespaceExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 48;
}
