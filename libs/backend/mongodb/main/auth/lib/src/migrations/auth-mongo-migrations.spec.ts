// @requirements REQ-AUTH-PERSISTENCE-007
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { AuthMongoCollections } from '../auth-mongo.collections';
import { Migration20260726000200InitializeAuthPersistence } from './Migration20260726000200InitializeAuthPersistence';
import { Migration20260812120000AddAuthUserAccountRecovery } from './Migration20260812120000AddAuthUserAccountRecovery';
import { authMongoMigrations } from './index';

/**
 * A database that already carries every auth collection. Re-running a definition against it must go
 * through `collMod`, because `createCollection` fails once the namespace exists.
 */
function createExistingDatabase() {
  // Typed through the generic rather than by naming a parameter the body ignores: the test reads
  // `command.mock.calls` back, and an untyped mock records them as empty tuples.
  const command = vi.fn<(argument: Record<string, unknown>) => Promise<{ ok: number }>>(() =>
    Promise.resolve({ ok: 1 }),
  );
  // The RBAC seed that follows the collMod is not what this test is about, so every collection call
  // it makes resolves to something harmless.
  const stub = {
    createIndexes: () => Promise.resolve([]),
    updateOne: () => Promise.resolve({ acknowledged: true }),
    findOne: () => Promise.resolve({ _id: 'id' }),
    findOneAndUpdate: () => Promise.resolve({ _id: 'id' }),
    deleteMany: () => Promise.resolve({ deletedCount: 0 }),
    // The seed looks permissions up by key and insists on finding every one it asked for.
    find: (filter: { key?: { $in?: string[] } }) => ({
      toArray: () => Promise.resolve((filter.key?.$in ?? []).map((key) => ({ _id: key, key }))),
    }),
  };
  const database = {
    // 48 is Mongo's NamespaceExists.
    createCollection: () => Promise.reject(Object.assign(new Error('exists'), { code: 48 })),
    command,
    collection: () => stub,
  } as unknown as Db;

  return { database, command };
}

describe('auth Mongo migrations', () => {
  it('ships a recovery migration after the initial persistence bootstrap', () => {
    expect(authMongoMigrations).toContain(Migration20260812120000AddAuthUserAccountRecovery);
    expect(authMongoMigrations.indexOf(Migration20260726000200InitializeAuthPersistence)).toBeLessThan(
      authMongoMigrations.indexOf(Migration20260812120000AddAuthUserAccountRecovery),
    );
  });

  it('carries a monotonic id so the ordered runner accepts it', () => {
    expect(Migration20260812120000AddAuthUserAccountRecovery.id).toBe('20260812120000_add_auth_user_account_recovery');
    expect(
      Migration20260812120000AddAuthUserAccountRecovery.id > Migration20260726000200InitializeAuthPersistence.id,
    ).toBe(true);
  });

  it('relaxes the users validator on databases that were created before the recovery fields', async () => {
    // The bootstrap migration is already in the ledger on those databases, so it never re-runs.
    // Without this migration the stored validator keeps rejecting `credentialRevision` outright.
    const { database, command } = createExistingDatabase();

    await Migration20260812120000AddAuthUserAccountRecovery.up(database);

    const usersCollMod = command.mock.calls
      .map(([argument]) => argument)
      .find((argument) => argument['collMod'] === AuthMongoCollections.users);
    expect(usersCollMod).toBeDefined();
    const schema = (usersCollMod?.['validator'] as Record<string, Record<string, Record<string, unknown>>>)[
      '$jsonSchema'
    ];
    expect(schema?.['properties']).toHaveProperty('credentialRevision');
    expect(schema?.['properties']).toHaveProperty('emailVerifiedAt');
  });
});
