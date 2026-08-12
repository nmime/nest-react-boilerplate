// @requirements REQ-AUTH-PERSISTENCE-007
import type { Db, Document } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { makeAudit, makeOutbox, toDocument } from './auth-mongo-admin.repository';
import { MongoAuthUserRepository } from './auth-mongo-user.repository';
import { AuthMongoCollectionDefinitions, AuthMongoCollections } from './auth-mongo.collections';
import { repositoryResult, type MongoAuthDocument } from './auth-mongo.util';

const TenantId = '00000000-0000-0000-0000-000000000000';

/**
 * A single-user stand-in for the driver. RBAC lookups resolve empty, which is all the record mapper
 * needs, so the assertions stay on the update documents this repository actually sends.
 */
function createUserDatabase(seed: Partial<MongoAuthDocument> = {}, exists = true) {
  const stored: MongoAuthDocument = {
    _id: 'user-id',
    tenantId: TenantId,
    email: 'user@example.com',
    displayName: 'User',
    passwordHash: 'old-hash',
    status: 'active',
    locale: 'en',
    theme: 'system',
    lastLoginAt: new Date(0),
    avatarUrl: '',
    avatarHash: '',
    avatarStatus: 'none',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...seed,
  };
  const updates: Document[] = [];
  const users = {
    findOne: () => Promise.resolve(exists ? stored : null),
    findOneAndUpdate: (_filter: Document, update: Document) => {
      updates.push(update);
      if (!exists) {
        return Promise.resolve(null);
      }
      Object.assign(stored, update['$set']);
      for (const [key, delta] of Object.entries((update['$inc'] ?? {}) as Record<string, number>)) {
        stored[key] = Number(stored[key] ?? 0) + delta;
      }
      return Promise.resolve(stored);
    },
    insertOne: (document: MongoAuthDocument) => {
      Object.assign(stored, document);
      return Promise.resolve({ insertedId: document._id });
    },
  };
  const empty = { find: () => ({ toArray: () => Promise.resolve([]) }) };
  const database = {
    collection: (name: string) => (name === AuthMongoCollections.users ? users : empty),
  } as unknown as Db;

  return { database, stored, updates, users: new MongoAuthUserRepository(database) };
}

const usersValidatorProperties = (): Record<string, Document> => {
  const definition = AuthMongoCollectionDefinitions.find((item) => item.name === AuthMongoCollections.users);
  return definition?.['validator']['$jsonSchema']['properties'] as Record<string, Document>;
};

describe('Mongo auth account recovery', () => {
  it('stamps the verification time without disturbing the credential epoch', async () => {
    const { users, stored, updates } = createUserDatabase({ credentialRevision: 4 });
    const verifiedAt = new Date('2026-08-12T10:00:00.000Z');

    const record = (await users.verifyEmail('user-id', TenantId, verifiedAt))._unsafeUnwrap();

    expect(record?.emailVerifiedAt).toEqual(verifiedAt);
    expect(record?.credentialRevision).toBe(4);
    expect(stored['credentialRevision']).toBe(4);
    expect(updates[0]).not.toHaveProperty('$inc');
  });

  it('advances the credential epoch atomically with the new password', async () => {
    const { users, updates } = createUserDatabase({ credentialRevision: 4 });

    const record = (await users.replacePassword('user-id', 'new-hash', TenantId))._unsafeUnwrap();

    // One document, so a reset can never land the password without the epoch that revokes the
    // sessions still holding the old one.
    expect(updates).toHaveLength(1);
    expect(updates[0]?.['$set']).toMatchObject({ passwordHash: 'new-hash' });
    expect(updates[0]?.['$inc']).toEqual({ credentialRevision: 1 });
    expect(record?.passwordHash).toBe('new-hash');
    expect(record?.credentialRevision).toBe(5);
  });

  it('reads documents written before the epoch existed as unverified at revision zero', async () => {
    const { users } = createUserDatabase();

    const record = (await users.findById('user-id', TenantId))._unsafeUnwrap();

    expect(record?.emailVerifiedAt).toBeNull();
    expect(record?.credentialRevision).toBe(0);
  });

  it('seeds both recovery fields on create so the epoch is never absent on a fresh account', async () => {
    const { users, stored } = createUserDatabase();

    await users.createUser({ email: 'new@example.com', tenantId: TenantId });

    expect(stored['emailVerifiedAt']).toBeNull();
    expect(stored['credentialRevision']).toBe(0);
  });

  it('reports a vanished account rather than inventing one', async () => {
    const { users } = createUserDatabase({}, false);

    expect((await users.verifyEmail('user-id', TenantId))._unsafeUnwrap()).toBeNull();
    expect((await users.replacePassword('user-id', 'new-hash', TenantId))._unsafeUnwrap()).toBeNull();
  });

  it('admits both fields through the users validator, which rejects anything unlisted', () => {
    const properties = usersValidatorProperties();

    expect(properties['emailVerifiedAt']).toEqual({ bsonType: ['date', 'null'] });
    expect(properties['credentialRevision']).toEqual({ bsonType: ['int', 'long'] });
  });

  it('leaves the recovery fields optional so pre-existing documents still pass validation on update', () => {
    const definition = AuthMongoCollectionDefinitions.find((item) => item.name === AuthMongoCollections.users);
    const required = definition?.['validator']['$jsonSchema']['required'] as string[];

    expect(required).not.toContain('emailVerifiedAt');
    expect(required).not.toContain('credentialRevision');
  });
});

describe('Mongo auth persistence helpers', () => {
  it('keeps public UUID IDs while mapping documents to Mongo _id', () => {
    const audit = makeAudit({ action: 'admin.access', resource: 'admin.users' });
    const document = toDocument(audit);

    expect(document._id).toBe(audit.id);
    expect(audit.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(document).not.toHaveProperty('id');
  });

  it('creates tenant-scoped pending outbox records', () => {
    const audit = makeAudit({ action: 'admin.user.status.update', resource: 'admin.users' });
    const outbox = makeOutbox(audit, 'admin.user', '00000000-0000-0000-0000-000000000001');

    expect(outbox).toMatchObject({ tenantId: audit.tenantId, status: 'pending', eventType: audit.action });
  });

  it('maps driver failures to the neutral repository contract', async () => {
    const result = await repositoryResult(Promise.reject(new Error('driver failed')));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ code: 'repository_error', message: 'driver failed' });
    }
  });
});
