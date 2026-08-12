import { FiatCurrencyPersistence } from '@app/backend-feature-fiat-currency-shared';
import {
  MongoDatabaseToken,
  MongoMainModule,
  type MongoModuleOptions,
  verifyAppliedMongoMigrations,
} from '@app/backend-mongodb-main';
import { type DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { Db } from 'mongodb';
import { FiatCurrencyMongoPersistence } from './fiat-currency-mongo.repository';
import { fiatCurrencyMongoMigrations } from './migrations';

/**
 * Fails startup when the catalogue collections are missing or have drifted from their validators.
 *
 * A document store will happily accept writes into a collection nobody defined, so the check has to
 * happen here rather than being inferred from the first successful insert.
 */
@Injectable()
export class FiatCurrencyMongoMigrationVerifier implements OnModuleInit {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  onModuleInit(): Promise<void> {
    return verifyAppliedMongoMigrations(this.database, fiatCurrencyMongoMigrations);
  }
}

const providers = [
  FiatCurrencyMongoMigrationVerifier,
  FiatCurrencyMongoPersistence,
  { provide: FiatCurrencyPersistence, useExisting: FiatCurrencyMongoPersistence },
];

@Module({
  providers,
  exports: [FiatCurrencyPersistence, FiatCurrencyMongoPersistence],
})
export class FiatCurrencyMongoPersistenceModule {}

@Module({})
export class FiatCurrencyMongoModule {
  static forRoot(mongo: MongoModuleOptions = {}): DynamicModule {
    return {
      module: FiatCurrencyMongoModule,
      imports: [MongoMainModule.forRoot(mongo), FiatCurrencyMongoPersistenceModule],
      exports: [FiatCurrencyMongoPersistenceModule],
    };
  }
}
