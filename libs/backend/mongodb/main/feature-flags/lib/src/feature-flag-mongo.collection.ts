import type { CreateIndexesOptions, Db, IndexDescription } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from '../../../shared/lib/src/migrations/mongo-migration';
import type { FeatureFlagDocument } from './feature-flag-mongo.types';

export const FeatureFlagCollectionName = 'feature_flags';
export const FeatureFlagTenantKeyIndexName = 'uq__feature_flags__tenant_id_key';
export const FeatureFlagEnabledIndexName = 'ix__feature_flags__tenant_id_enabled_key';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const keyPattern = '^[a-z][a-z0-9]*(\\.[a-z][a-z0-9]*)*$';

export const FeatureFlagCollectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'tenantId', 'key', 'value', 'description', 'enabled', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'string' },
      tenantId: { bsonType: 'string', pattern: uuidPattern },
      key: { bsonType: 'string', minLength: 1, maxLength: 160, pattern: keyPattern },
      value: {
        bsonType: ['bool', 'string', 'int', 'long', 'double'],
        minimum: -Number.MAX_VALUE,
        maximum: Number.MAX_VALUE,
      },
      description: { bsonType: 'string' },
      enabled: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
} as const;

export const FeatureFlagIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  {
    name: FeatureFlagTenantKeyIndexName,
    key: { tenantId: 1, key: 1 },
    unique: true,
  },
  {
    name: FeatureFlagEnabledIndexName,
    key: { tenantId: 1, enabled: 1, key: 1 },
  },
];

export async function initializeFeatureFlagCollection(database: Db): Promise<void> {
  let existed = false;
  try {
    await database.createCollection<FeatureFlagDocument>(FeatureFlagCollectionName, {
      validator: FeatureFlagCollectionValidator,
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
      collMod: FeatureFlagCollectionName,
      validator: FeatureFlagCollectionValidator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
  }

  await database.collection<FeatureFlagDocument>(FeatureFlagCollectionName).createIndexes(FeatureFlagIndexes);
}

export async function verifyFeatureFlagCollection(database: Db): Promise<void> {
  await assertCollectionDefinition(database, {
    name: FeatureFlagCollectionName,
    validator: FeatureFlagCollectionValidator,
    indexes: FeatureFlagIndexes,
  });
}

function isNamespaceExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 48;
}
