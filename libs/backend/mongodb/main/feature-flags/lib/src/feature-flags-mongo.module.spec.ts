import { describe, expect, it } from 'vitest';
import { MongoMainModule } from '@app/backend-mongodb-main';
import { FeatureFlagProviderToken, FeatureFlagRepositoryToken } from '@app/common-feature-flags';
import { MongoFeatureFlagRepository } from './feature-flag-mongo.repository';
import { MongoFeatureFlagProvider } from './feature-flag-mongo.service';
import {
  FeatureFlagMongoMigrationVerifier,
  FeatureFlagsMongoModule,
  FeatureFlagsMongoPersistenceModule,
} from './feature-flags-mongo.module';

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
});
