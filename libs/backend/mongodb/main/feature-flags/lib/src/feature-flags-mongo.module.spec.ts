// @requirements REQ-RUNTIME-DATABASE-008
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

const migrationMocks = vi.hoisted(() => ({
  verifyAppliedMongoMigrations: vi.fn(() => Promise.resolve()),
}));

vi.mock('@app/backend-mongodb-main', async (importOriginal) => {
  const original = await importOriginal<typeof import('@app/backend-mongodb-main')>();
  return { ...original, verifyAppliedMongoMigrations: migrationMocks.verifyAppliedMongoMigrations };
});

import { MongoMainModule } from '@app/backend-mongodb-main';
import { FeatureFlagProviderToken, FeatureFlagRepositoryToken } from '@app/common-feature-flags';
import { MongoFeatureFlagRepository } from './feature-flag-mongo.repository';
import { MongoFeatureFlagProvider } from './feature-flag-mongo.service';
import {
  FeatureFlagMongoMigrationVerifier,
  FeatureFlagsMongoModule,
  FeatureFlagsMongoPersistenceModule,
} from './feature-flags-mongo.module';
import { featureFlagMongoMigrations } from './migrations';

describe('FeatureFlagsMongoModule', () => {
  it('registers shared MongoDB and exports repository and provider tokens', () => {
    const dynamicModule = FeatureFlagsMongoModule.forRoot({
      env: {
        MONGODB_URI: 'mongodb://mongo/app?replicaSet=rs0',
        MONGODB_DATABASE: 'app',
      },
    });

    expect(dynamicModule.module).toBe(FeatureFlagsMongoModule);
    expect(dynamicModule.imports?.[0]).toMatchObject({ module: MongoMainModule });
    expect(dynamicModule.imports).toContain(FeatureFlagsMongoPersistenceModule);
    expect(Reflect.getMetadata('providers', FeatureFlagsMongoPersistenceModule)).toEqual(
      expect.arrayContaining([
        FeatureFlagMongoMigrationVerifier,
        MongoFeatureFlagRepository,
        MongoFeatureFlagProvider,
        { provide: FeatureFlagProviderToken, useExisting: MongoFeatureFlagProvider },
        { provide: FeatureFlagRepositoryToken, useExisting: MongoFeatureFlagRepository },
      ]),
    );
    expect(dynamicModule.exports).toContain(FeatureFlagsMongoPersistenceModule);
  });

  it('verifies feature-flag migrations during module initialization', async () => {
    const database = {} as Db;
    await new FeatureFlagMongoMigrationVerifier(database).onModuleInit();
    expect(migrationMocks.verifyAppliedMongoMigrations).toHaveBeenCalledWith(database, featureFlagMongoMigrations);
  });
});
