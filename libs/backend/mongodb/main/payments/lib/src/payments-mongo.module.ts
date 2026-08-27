import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import {
  MongoDatabaseToken,
  MongoMainModule,
  type MongoModuleOptions,
  verifyAppliedMongoMigrations,
} from '@app/backend-mongodb-main';
import { type DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { Db } from 'mongodb';
import { PaymentsMongoPersistence } from './payments-mongo.repository';
import { paymentsMongoMigrations } from './migrations';

@Injectable()
export class PaymentsMongoMigrationVerifier implements OnModuleInit {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  onModuleInit(): Promise<void> {
    return verifyAppliedMongoMigrations(this.database, paymentsMongoMigrations);
  }
}

const providers = [
  PaymentsMongoMigrationVerifier,
  PaymentsMongoPersistence,
  { provide: PaymentsPersistence, useExisting: PaymentsMongoPersistence },
];

@Module({
  providers,
  exports: [PaymentsPersistence, PaymentsMongoPersistence],
})
export class PaymentsMongoPersistenceModule {}

@Module({})
export class PaymentsMongoModule {
  static forRoot(mongo: MongoModuleOptions = {}): DynamicModule {
    return {
      module: PaymentsMongoModule,
      imports: [MongoMainModule.forRoot(mongo), PaymentsMongoPersistenceModule],
      exports: [PaymentsMongoPersistenceModule],
    };
  }
}
