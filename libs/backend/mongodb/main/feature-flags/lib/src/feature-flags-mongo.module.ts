import { DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { Db } from 'mongodb';
import {
  MongoDatabaseToken,
  MongoMainModule,
  type MongoModuleOptions,
  verifyAppliedMongoMigrations,
} from '@app/backend-mongodb-main';
import { FeatureFlagProviderToken, FeatureFlagRepositoryToken } from '@app/common-feature-flags';
import { MongoFeatureFlagRepository } from './feature-flag-mongo.repository';
import { MongoFeatureFlagProvider } from './feature-flag-mongo.service';
import { featureFlagMongoMigrations } from './migrations';

@Injectable()
export class FeatureFlagMongoMigrationVerifier implements OnModuleInit {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  onModuleInit(): Promise<void> {
    return verifyAppliedMongoMigrations(this.database, featureFlagMongoMigrations);
  }
}

const providers = [
  FeatureFlagMongoMigrationVerifier,
  MongoFeatureFlagRepository,
  MongoFeatureFlagProvider,
  { provide: FeatureFlagProviderToken, useExisting: MongoFeatureFlagProvider },
  { provide: FeatureFlagRepositoryToken, useExisting: MongoFeatureFlagRepository },
];

@Module({
  providers,
  exports: [MongoFeatureFlagRepository, MongoFeatureFlagProvider, FeatureFlagProviderToken, FeatureFlagRepositoryToken],
})
export class FeatureFlagsMongoPersistenceModule {}

@Module({})
export class FeatureFlagsMongoModule {
  static forRoot(mongo: MongoModuleOptions = {}): DynamicModule {
    return {
      module: FeatureFlagsMongoModule,
      imports: [MongoMainModule.forRoot(mongo), FeatureFlagsMongoPersistenceModule],
      exports: [FeatureFlagsMongoPersistenceModule],
    };
  }
}
