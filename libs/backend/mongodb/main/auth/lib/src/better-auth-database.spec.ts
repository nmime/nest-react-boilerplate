// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it, vi } from 'vitest';
import { BetterAuthDatabaseProviderInjectToken } from '@app/backend-feature-auth-shared';
import { MongoClientToken, MongoDatabaseToken } from './mongo-runtime';

const mocks = vi.hoisted(() => ({
  adapter: { id: 'mongodb-adapter' },
  mongodbAdapter: vi.fn(() => ({ id: 'mongodb-adapter' })),
}));

vi.mock('better-auth/adapters/mongodb', () => ({ mongodbAdapter: mocks.mongodbAdapter }));

import { AuthMongoPersistenceModule } from './auth-mongo.module';

describe('AuthMongoPersistenceModule Better Auth adapter', () => {
  it('uses the selected shared database and native client for transactions', () => {
    const providers = Reflect.getMetadata('providers', AuthMongoPersistenceModule) as Array<Record<string, unknown>>;
    const provider = providers.find((candidate) => candidate.provide === BetterAuthDatabaseProviderInjectToken);
    if (!provider || typeof provider.useFactory !== 'function') {
      throw new Error('Expected the Better Auth MongoDB provider factory.');
    }
    const database = { databaseName: 'auth' };
    const client = { close: vi.fn() };

    expect((provider.useFactory as (db: unknown, mongoClient: unknown) => unknown)(database, client)).toEqual({
      database: mocks.adapter,
    });
    expect(mocks.mongodbAdapter).toHaveBeenCalledWith(database, { client });
    expect(provider.inject).toEqual([MongoDatabaseToken, MongoClientToken]);
  });
});
