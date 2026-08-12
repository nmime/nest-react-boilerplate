// @requirements REQ-FIAT-HISTORY-003
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

const migrationMocks = vi.hoisted(() => ({
  verifyAppliedMongoMigrations: vi.fn(() => Promise.resolve()),
}));

vi.mock('@app/backend-mongodb-main', async (importOriginal) => {
  const original = await importOriginal<typeof import('@app/backend-mongodb-main')>();
  return { ...original, verifyAppliedMongoMigrations: migrationMocks.verifyAppliedMongoMigrations };
});

import { FiatCurrencyPersistence } from '@app/backend-feature-fiat-currency-shared';
import { MongoMainModule } from '@app/backend-mongodb-main';
import {
  FiatCurrencyMongoMigrationVerifier,
  FiatCurrencyMongoModule,
  FiatCurrencyMongoPersistenceModule,
} from './fiat-currency-mongo.module';
import { FiatCurrencyMongoPersistence } from './fiat-currency-mongo.repository';
import { fiatCurrencyMongoMigrations } from './migrations';

describe('FiatCurrencyMongoModule', () => {
  it('binds the persistence port so the feature never names an axis', () => {
    expect(Reflect.getMetadata('providers', FiatCurrencyMongoPersistenceModule)).toEqual(
      expect.arrayContaining([
        FiatCurrencyMongoMigrationVerifier,
        FiatCurrencyMongoPersistence,
        { provide: FiatCurrencyPersistence, useExisting: FiatCurrencyMongoPersistence },
      ]),
    );
    expect(Reflect.getMetadata('exports', FiatCurrencyMongoPersistenceModule)).toEqual(
      expect.arrayContaining([FiatCurrencyPersistence, FiatCurrencyMongoPersistence]),
    );
  });

  it('registers the shared MongoDB connection alongside the persistence module', () => {
    const dynamicModule = FiatCurrencyMongoModule.forRoot({
      env: { MONGODB_URI: 'mongodb://mongo/app?replicaSet=rs0', MONGODB_DATABASE: 'app' },
    });

    expect(dynamicModule.module).toBe(FiatCurrencyMongoModule);
    expect(dynamicModule.imports?.[0]).toMatchObject({ module: MongoMainModule });
    expect(dynamicModule.imports).toContain(FiatCurrencyMongoPersistenceModule);
    expect(dynamicModule.exports).toContain(FiatCurrencyMongoPersistenceModule);
  });

  it('refuses to start against a database the migration never reached', async () => {
    const database = {} as Db;

    await new FiatCurrencyMongoMigrationVerifier(database).onModuleInit();

    expect(migrationMocks.verifyAppliedMongoMigrations).toHaveBeenCalledWith(database, fiatCurrencyMongoMigrations);
  });
});
