import { isDeepStrictEqual } from 'node:util';
import type { Collection, Db, Document, IndexDescription, IndexDescriptionInfo } from 'mongodb';

/* eslint-disable no-await-in-loop -- Migrations must apply and verify in deterministic order. */

export const MongoMigrationLedgerCollection = 'mongo_migrations';

const MongoMigrationLedgerValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'name', 'appliedAt'],
    properties: {
      _id: { bsonType: 'string', pattern: '^\\d{14}_[a-z0-9_]+$' },
      name: { bsonType: 'string', minLength: 1 },
      appliedAt: { bsonType: 'date' },
    },
  },
} as const;

export interface MongoCollectionDefinition {
  readonly name: string;
  readonly validator: Document;
  readonly indexes: readonly IndexDescription[];
}

export interface MongoMigration {
  readonly id: string;
  readonly name: string;
  up(database: Db): Promise<void>;
  verify(database: Db): Promise<void>;
}

export interface MongoMigrationResult {
  readonly applied: string[];
  readonly skipped: string[];
}

interface MongoMigrationLedgerDocument extends Document {
  _id: string;
  name: string;
  appliedAt: Date;
}

export async function runMongoMigrations(
  database: Db,
  migrations: readonly MongoMigration[],
): Promise<MongoMigrationResult> {
  assertOrderedMigrations(migrations);
  await ensureMigrationLedger(database);
  const ledger = database.collection<MongoMigrationLedgerDocument>(MongoMigrationLedgerCollection);
  await assertNoUnknownLedgerEntries(ledger, migrations);

  const result: MongoMigrationResult = { applied: [], skipped: [] };
  for (const migration of migrations) {
    const recorded = await ledger.findOne({ _id: migration.id });
    if (recorded !== null) {
      assertLedgerEntry(recorded, migration);
      await migration.verify(database);
      result.skipped.push(migration.id);
      continue;
    }

    // MongoDB collection and index DDL is not transactional. Each migration must
    // therefore tolerate replay before it is durably recorded in the ledger.
    await migration.up(database);
    await migration.verify(database);

    try {
      await ledger.insertOne(
        { _id: migration.id, name: migration.name, appliedAt: new Date() },
        { writeConcern: { w: 'majority' } },
      );
      result.applied.push(migration.id);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const concurrentEntry = await ledger.findOne({ _id: migration.id });
      if (concurrentEntry === null) {
        throw error;
      }
      assertLedgerEntry(concurrentEntry, migration);
      await migration.verify(database);
      result.skipped.push(migration.id);
    }
  }

  await verifyMongoMigrations(database, migrations);
  return result;
}

export async function verifyMongoMigrations(database: Db, migrations: readonly MongoMigration[]): Promise<void> {
  assertOrderedMigrations(migrations);
  await assertCollectionDefinition(database, {
    name: MongoMigrationLedgerCollection,
    validator: MongoMigrationLedgerValidator,
    indexes: [],
  });
  const ledger = database.collection<MongoMigrationLedgerDocument>(MongoMigrationLedgerCollection);
  await assertNoUnknownLedgerEntries(ledger, migrations);

  for (const migration of migrations) {
    const recorded = await ledger.findOne({ _id: migration.id });
    if (recorded === null) {
      throw new Error(`MongoDB migration ${migration.id} is not recorded in ${MongoMigrationLedgerCollection}.`);
    }
    assertLedgerEntry(recorded, migration);
    await migration.verify(database);
  }
}

/** Verify an owning module's applied migrations without rejecting entries owned by other modules. */
export async function verifyAppliedMongoMigrations(database: Db, migrations: readonly MongoMigration[]): Promise<void> {
  assertOrderedMigrations(migrations);
  await assertCollectionDefinition(database, {
    name: MongoMigrationLedgerCollection,
    validator: MongoMigrationLedgerValidator,
    indexes: [],
  });
  const ledger = database.collection<MongoMigrationLedgerDocument>(MongoMigrationLedgerCollection);
  for (const migration of migrations) {
    const recorded = await ledger.findOne({ _id: migration.id });
    if (recorded === null) {
      throw new Error(`MongoDB migration ${migration.id} is not recorded in ${MongoMigrationLedgerCollection}.`);
    }
    assertLedgerEntry(recorded, migration);
    await migration.verify(database);
  }
}

export async function ensureCollection(database: Db, name: string): Promise<void> {
  if (await collectionExists(database, name)) {
    return;
  }

  try {
    await database.createCollection(name, { writeConcern: { w: 'majority' } });
  } catch (error) {
    if (!isNamespaceExistsError(error)) {
      throw error;
    }
  }
}

export async function assertCollectionDefinition(database: Db, definition: MongoCollectionDefinition): Promise<void> {
  const collections = await database.listCollections({ name: definition.name }, { nameOnly: false }).toArray();
  const collection = collections.find((candidate) => candidate.name === definition.name);
  if (collection === undefined) {
    throw new Error(`Required MongoDB collection ${definition.name} is missing.`);
  }

  const options = collection.options ?? {};
  assertEquivalent(
    options.validator,
    definition.validator,
    `MongoDB collection ${definition.name} has an incompatible validator.`,
  );
  if (options.validationAction !== 'error' || options.validationLevel !== 'strict') {
    throw new Error(`MongoDB collection ${definition.name} does not enforce strict validation.`);
  }

  const indexes = (await database
    .collection(definition.name)
    .listIndexes()
    .toArray()) as unknown as IndexDescriptionInfo[];
  for (const expected of definition.indexes) {
    assertIndexDescription(definition.name, indexes, expected);
  }
}

export async function assertCollectionExists(database: Db, name: string): Promise<void> {
  if (!(await collectionExists(database, name))) {
    throw new Error(`Required MongoDB collection ${name} is missing.`);
  }
}

export async function ensureIndex(
  collection: Collection,
  keys: Readonly<Record<string, 1 | -1>>,
  options: { readonly name: string; readonly unique?: boolean; readonly expireAfterSeconds?: number },
): Promise<void> {
  await collection.createIndex(keys, {
    ...options,
    commitQuorum: 'votingMembers',
  });
}

export async function assertIndex(
  collection: Collection,
  keys: Readonly<Record<string, 1 | -1>>,
  options: { readonly name: string; readonly unique?: boolean; readonly expireAfterSeconds?: number },
): Promise<void> {
  const indexes = (await collection.listIndexes().toArray()) as unknown as IndexDescriptionInfo[];
  assertIndexDescription(collection.collectionName, indexes, { key: keys, ...options });
}

async function ensureMigrationLedger(database: Db): Promise<void> {
  await ensureCollection(database, MongoMigrationLedgerCollection);
  await database.command({
    collMod: MongoMigrationLedgerCollection,
    validator: MongoMigrationLedgerValidator,
    validationAction: 'error',
    validationLevel: 'strict',
  });
  await assertCollectionDefinition(database, {
    name: MongoMigrationLedgerCollection,
    validator: MongoMigrationLedgerValidator,
    indexes: [],
  });
}

function assertIndexDescription(
  collectionName: string,
  indexes: readonly IndexDescriptionInfo[],
  expected: IndexDescription,
): void {
  if (typeof expected.name !== 'string' || expected.name === '') {
    throw new Error(`Required MongoDB index on ${collectionName} must have a deterministic name.`);
  }
  const actual = indexes.find((index) => index.name === expected.name);
  if (actual === undefined) {
    throw new Error(`Required MongoDB index ${collectionName}.${expected.name} is missing.`);
  }
  if (Array.isArray(expected.key) || typeof expected.key !== 'object') {
    throw new Error(`Required MongoDB index ${collectionName}.${expected.name} has unsupported keys.`);
  }
  assertIndexKeys(collectionName, actual, expected.key as Readonly<Record<string, 1 | -1>>);

  if (Boolean(actual.unique) !== Boolean(expected.unique)) {
    throw new Error(`MongoDB index ${collectionName}.${expected.name} has an unexpected unique setting.`);
  }
  if (Boolean(actual.sparse) !== Boolean(expected.sparse)) {
    throw new Error(`MongoDB index ${collectionName}.${expected.name} has an unexpected sparse setting.`);
  }
  if (Boolean(actual.hidden) !== Boolean(expected.hidden)) {
    throw new Error(`MongoDB index ${collectionName}.${expected.name} has an unexpected hidden setting.`);
  }
  if (actual.expireAfterSeconds !== expected.expireAfterSeconds) {
    throw new Error(`MongoDB index ${collectionName}.${expected.name} has an unexpected TTL setting.`);
  }
  assertEquivalent(
    actual.partialFilterExpression,
    expected.partialFilterExpression,
    `MongoDB index ${collectionName}.${expected.name} has an unexpected partial filter.`,
  );
  assertCollation(collectionName, expected.name, actual.collation, expected.collation);
}

function assertCollation(
  collectionName: string,
  indexName: string,
  actual: Document | undefined,
  expected: Document | undefined,
): void {
  if (expected === undefined) {
    if (actual !== undefined) {
      throw new Error(`MongoDB index ${collectionName}.${indexName} has an unexpected collation.`);
    }
    return;
  }
  if (actual === undefined) {
    throw new Error(`MongoDB index ${collectionName}.${indexName} has an unexpected collation.`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (!isDeepStrictEqual(actual[key], value)) {
      throw new Error(`MongoDB index ${collectionName}.${indexName} has an unexpected collation.`);
    }
  }
}

function assertEquivalent(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(message);
  }
}

function assertOrderedMigrations(migrations: readonly MongoMigration[]): void {
  let previousId: string | undefined;
  const ids = new Set<string>();
  for (const migration of migrations) {
    if (!/^\d{14}_[a-z0-9_]+$/u.test(migration.id)) {
      throw new Error(`Invalid MongoDB migration id ${migration.id}.`);
    }
    if (migration.name.trim() === '') {
      throw new Error(`MongoDB migration ${migration.id} must have a name.`);
    }
    if (ids.has(migration.id)) {
      throw new Error(`Duplicate MongoDB migration id ${migration.id}.`);
    }
    if (previousId !== undefined && migration.id.localeCompare(previousId) <= 0) {
      throw new Error('MongoDB migrations must be declared in strictly increasing id order.');
    }
    ids.add(migration.id);
    previousId = migration.id;
  }
}

async function collectionExists(database: Db, name: string): Promise<boolean> {
  const collections = await database.listCollections({ name }, { nameOnly: true }).toArray();
  return collections.some((collection) => collection.name === name);
}

async function assertNoUnknownLedgerEntries(
  ledger: Collection<MongoMigrationLedgerDocument>,
  migrations: readonly MongoMigration[],
): Promise<void> {
  const knownIds = new Set(migrations.map((migration) => migration.id));
  const entries = await ledger.find({}, { projection: { _id: 1 } }).toArray();
  const unknown = entries
    .map((entry) => entry._id)
    .filter((id) => !knownIds.has(id))
    .sort((left, right) => left.localeCompare(right));
  if (unknown.length > 0) {
    throw new Error(`MongoDB migration ledger contains unknown migration ${unknown[0]}.`);
  }
}

function assertLedgerEntry(entry: MongoMigrationLedgerDocument, migration: MongoMigration): void {
  if (entry.name !== migration.name) {
    throw new Error(`MongoDB migration ledger entry ${migration.id} does not match ${migration.name}.`);
  }
  if (!(entry.appliedAt instanceof Date) || Number.isNaN(entry.appliedAt.getTime())) {
    throw new Error(`MongoDB migration ledger entry ${migration.id} has an invalid appliedAt value.`);
  }
}

function assertIndexKeys(
  collectionName: string,
  actual: IndexDescriptionInfo,
  expected: Readonly<Record<string, 1 | -1>>,
): void {
  const actualEntries = Object.entries(actual.key);
  const expectedEntries = Object.entries(expected);
  if (
    actualEntries.length !== expectedEntries.length ||
    actualEntries.some(([field, direction], index) => {
      const expectedEntry = expectedEntries[index];
      return expectedEntry === undefined || field !== expectedEntry[0] || direction !== expectedEntry[1];
    })
  ) {
    throw new Error(`MongoDB index ${collectionName}.${actual.name ?? '<unnamed>'} has unexpected keys.`);
  }
}

function isNamespaceExistsError(error: unknown): boolean {
  return errorCode(error) === 48;
}

function isDuplicateKeyError(error: unknown): boolean {
  return errorCode(error) === 11000;
}

function errorCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
    ? error.code
    : undefined;
}
