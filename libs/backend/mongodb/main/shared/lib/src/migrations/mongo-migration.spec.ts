// @requirements REQ-RUNTIME-DATABASE-008
import type { Db, Document, IndexDescriptionInfo } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { Migration20260726000000CreateBetterAuthCollections } from './Migration20260726000000CreateBetterAuthCollections';
import { Migration20260726000100CreateCanonicalSessions } from './Migration20260726000100CreateCanonicalSessions';
import {
  assertCollectionDefinition,
  MongoMigrationLedgerCollection,
  runMongoMigrations,
  type MongoMigration,
  verifyAppliedMongoMigrations,
  verifyMongoMigrations,
} from './mongo-migration';

interface LedgerDocument extends Document {
  _id: string;
  name: string;
  appliedAt: Date;
}

class FakeCollection {
  readonly documents = new Map<string, LedgerDocument>();
  readonly indexes: IndexDescriptionInfo[] = [{ name: '_id_', key: { _id: 1 }, unique: true }];
  readonly options: Document;
  duplicateAfterInsert = false;

  constructor(
    readonly collectionName: string,
    options: Document = {},
  ) {
    this.options = { ...options };
    delete this.options.writeConcern;
  }

  async createIndex(keys: Document, options: Document): Promise<string> {
    const existing = this.indexes.find((index) => index.name === options.name);
    if (existing === undefined) {
      this.indexes.push({ name: options.name, key: keys, ...options });
    }
    return String(options.name);
  }

  listIndexes(): { toArray: () => Promise<IndexDescriptionInfo[]> } {
    return { toArray: async () => this.indexes };
  }

  async findOne(filter: { _id: string }): Promise<LedgerDocument | null> {
    return this.documents.get(filter._id) ?? null;
  }

  find(): { toArray: () => Promise<LedgerDocument[]> } {
    return { toArray: async () => [...this.documents.values()] };
  }

  async insertOne(document: LedgerDocument): Promise<void> {
    this.documents.set(document._id, document);
    if (this.duplicateAfterInsert) {
      this.duplicateAfterInsert = false;
      throw Object.assign(new Error('duplicate'), { code: 11000 });
    }
  }
}

class FakeDatabase {
  readonly collections = new Map<string, FakeCollection>();

  listCollections(filter: { name: string }): {
    toArray: () => Promise<Array<{ name: string; options: Document }>>;
  } {
    return {
      toArray: async () => {
        const collection = this.collections.get(filter.name);
        return collection === undefined ? [] : [{ name: filter.name, options: collection.options }];
      },
    };
  }

  async createCollection(name: string, options: Document = {}): Promise<FakeCollection> {
    const collection = new FakeCollection(name, options);
    this.collections.set(name, collection);
    return collection;
  }

  async command(command: Document): Promise<void> {
    const name = String(command.collMod);
    const collection = this.collection(name);
    collection.options.validator = command.validator;
    collection.options.validationAction = command.validationAction;
    collection.options.validationLevel = command.validationLevel;
  }

  collection(name: string): FakeCollection {
    let collection = this.collections.get(name);
    if (collection === undefined) {
      collection = new FakeCollection(name);
      this.collections.set(name, collection);
    }
    return collection;
  }
}

function asDatabase(database: FakeDatabase): Db {
  return database as unknown as Db;
}

describe('MongoDB migration ledger', () => {
  it('applies auth and session DDL in order, records it, and becomes a verified no-op', async () => {
    const database = new FakeDatabase();
    const migrations = [
      Migration20260726000000CreateBetterAuthCollections,
      Migration20260726000100CreateCanonicalSessions,
    ];

    await expect(runMongoMigrations(asDatabase(database), migrations)).resolves.toEqual({
      applied: ['20260726000000_create_better_auth_collections', '20260726000100_create_canonical_sessions'],
      skipped: [],
    });
    await expect(runMongoMigrations(asDatabase(database), migrations)).resolves.toEqual({
      applied: [],
      skipped: ['20260726000000_create_better_auth_collections', '20260726000100_create_canonical_sessions'],
    });

    expect([...database.collections.keys()]).toEqual([
      MongoMigrationLedgerCollection,
      'user',
      'session',
      'account',
      'verification',
      'fastify_sessions',
    ]);
    expect(database.collection('session').indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uq__session__token', unique: true }),
        expect.objectContaining({ name: 'ttl__session__expiresAt', expireAfterSeconds: 0 }),
      ]),
    );
    expect(database.collection('verification').indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ttl__verification__expiresAt', expireAfterSeconds: 0 }),
      ]),
    );
    expect(database.collection('fastify_sessions').indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ux__fastify_sessions__sid', unique: true }),
        expect.objectContaining({ name: 'ix__fastify_sessions__expire', expireAfterSeconds: 0 }),
      ]),
    );
  });

  it('does not record a partially applied migration whose verification fails', async () => {
    const database = new FakeDatabase();
    const migration: MongoMigration = {
      id: '20260726000001_failing_verification',
      name: 'FailingVerification',
      up: vi.fn(async () => undefined),
      verify: vi.fn(async () => {
        throw new Error('schema incomplete');
      }),
    };

    await expect(runMongoMigrations(asDatabase(database), [migration])).rejects.toThrow('schema incomplete');
    expect(database.collection(MongoMigrationLedgerCollection).documents.size).toBe(0);
  });

  it('verifies an owning migration subset without rejecting other owners in the ledger', async () => {
    const database = new FakeDatabase();
    const migrations = [
      Migration20260726000000CreateBetterAuthCollections,
      Migration20260726000100CreateCanonicalSessions,
    ];
    await runMongoMigrations(asDatabase(database), migrations);

    await expect(verifyAppliedMongoMigrations(asDatabase(database), [migrations[0]!])).resolves.toBeUndefined();
    database.collection(MongoMigrationLedgerCollection).documents.delete(migrations[0]!.id);
    await expect(verifyAppliedMongoMigrations(asDatabase(database), [migrations[0]!])).rejects.toThrow(
      'is not recorded',
    );
  });

  it('treats a concurrent matching ledger insert as a safe skip', async () => {
    const database = new FakeDatabase();
    await database.createCollection(MongoMigrationLedgerCollection);
    database.collection(MongoMigrationLedgerCollection).duplicateAfterInsert = true;
    const migration: MongoMigration = {
      id: '20260726000002_concurrent_insert',
      name: 'ConcurrentInsert',
      up: vi.fn(async () => undefined),
      verify: vi.fn(async () => undefined),
    };

    await expect(runMongoMigrations(asDatabase(database), [migration])).resolves.toEqual({
      applied: [],
      skipped: [migration.id],
    });
    expect(migration.verify).toHaveBeenCalledTimes(3);
  });

  it('fails verification for missing or incompatible required indexes', async () => {
    const database = new FakeDatabase();
    const migrations = [Migration20260726000000CreateBetterAuthCollections];
    await runMongoMigrations(asDatabase(database), migrations);

    const sessionIndexes = database.collection('session').indexes;
    sessionIndexes.splice(
      sessionIndexes.findIndex((index) => index.name === 'ttl__session__expiresAt'),
      1,
    );
    await expect(verifyMongoMigrations(asDatabase(database), migrations)).rejects.toThrow(
      'session.ttl__session__expiresAt is missing',
    );

    await Migration20260726000000CreateBetterAuthCollections.up(asDatabase(database));
    const sessionToken = database.collection('session').indexes.find((index) => index.name === 'uq__session__token');
    if (sessionToken !== undefined) {
      sessionToken.unique = false;
    }
    await expect(verifyMongoMigrations(asDatabase(database), migrations)).rejects.toThrow('unexpected unique setting');

    if (sessionToken !== undefined) {
      sessionToken.unique = true;
      sessionToken.hidden = true;
    }
    await expect(verifyMongoMigrations(asDatabase(database), migrations)).rejects.toThrow('unexpected hidden setting');
  });

  it('detects incompatible validators, partial indexes, and collations', async () => {
    const database = new FakeDatabase();
    const definition = {
      name: 'segments',
      validator: { $jsonSchema: { bsonType: 'object', required: ['tenantId'] } },
      indexes: [
        {
          name: 'uq__segments__tenant_name',
          key: { tenantId: 1, name: 1 },
          unique: true,
          partialFilterExpression: { status: 'active' },
          collation: { locale: 'en', strength: 2 },
        },
      ],
    };
    const collection = await database.createCollection(definition.name, {
      validator: definition.validator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
    await collection.createIndex(definition.indexes[0]?.key ?? {}, definition.indexes[0] ?? {});

    await expect(assertCollectionDefinition(asDatabase(database), definition)).resolves.toBeUndefined();
    collection.options.validator = { $jsonSchema: { bsonType: 'array' } };
    await expect(assertCollectionDefinition(asDatabase(database), definition)).rejects.toThrow(
      'incompatible validator',
    );

    collection.options.validator = definition.validator;
    const index = collection.indexes.find((candidate) => candidate.name === 'uq__segments__tenant_name');
    if (index !== undefined) {
      index.partialFilterExpression = { status: 'archived' };
    }
    await expect(assertCollectionDefinition(asDatabase(database), definition)).rejects.toThrow('partial filter');

    if (index !== undefined) {
      index.partialFilterExpression = { status: 'active' };
      index.collation = { locale: 'en', strength: 1 };
    }
    await expect(assertCollectionDefinition(asDatabase(database), definition)).rejects.toThrow('collation');
  });

  it('rejects invalid ordering and unknown ledger entries', async () => {
    const database = new FakeDatabase();
    const later: MongoMigration = {
      id: '20260726000004_later',
      name: 'Later',
      up: vi.fn(async () => undefined),
      verify: vi.fn(async () => undefined),
    };
    const earlier = { ...later, id: '20260726000003_earlier', name: 'Earlier' };
    await expect(runMongoMigrations(asDatabase(database), [later, earlier])).rejects.toThrow('strictly increasing');

    await database.createCollection(MongoMigrationLedgerCollection);
    database.collection(MongoMigrationLedgerCollection).documents.set('20260726000005_unknown', {
      _id: '20260726000005_unknown',
      name: 'Unknown',
      appliedAt: new Date(),
    });
    await expect(runMongoMigrations(asDatabase(database), [earlier])).rejects.toThrow('unknown migration');
  });
});
