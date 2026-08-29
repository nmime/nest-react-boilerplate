// @requirements REQ-PAYMENT-PROVIDER-005
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

const migrationMocks = vi.hoisted(() => ({
  verifyAppliedMongoMigrations: vi.fn(() => Promise.resolve()),
}));

vi.mock('@app/backend-mongodb-main', async (importOriginal) => {
  const original = await importOriginal<typeof import('@app/backend-mongodb-main')>();
  return { ...original, verifyAppliedMongoMigrations: migrationMocks.verifyAppliedMongoMigrations };
});

import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import { MongoMainModule } from '@app/backend-mongodb-main';
import {
  PaymentsMongoMigrationVerifier,
  PaymentsMongoModule,
  PaymentsMongoPersistenceModule,
} from './payments-mongo.module';
import { PaymentsMongoPersistence } from './payments-mongo.repository';
import { paymentsMongoMigrations } from './migrations';

describe('PaymentsMongoModule', () => {
  it('binds the storage-neutral persistence port', () => {
    expect(Reflect.getMetadata('providers', PaymentsMongoPersistenceModule)).toEqual(
      expect.arrayContaining([
        PaymentsMongoMigrationVerifier,
        PaymentsMongoPersistence,
        { provide: PaymentsPersistence, useExisting: PaymentsMongoPersistence },
      ]),
    );
    expect(Reflect.getMetadata('exports', PaymentsMongoPersistenceModule)).toEqual([
      PaymentsPersistence,
      PaymentsMongoPersistence,
    ]);
  });

  it('registers the shared MongoDB connection through forRoot', () => {
    const dynamicModule = PaymentsMongoModule.forRoot({
      env: { MONGODB_URI: 'mongodb://mongo/app?replicaSet=rs0', MONGODB_DATABASE: 'app' },
    });

    expect(dynamicModule.module).toBe(PaymentsMongoModule);
    expect(dynamicModule.imports?.[0]).toMatchObject({ module: MongoMainModule });
    expect(dynamicModule.imports).toContain(PaymentsMongoPersistenceModule);
    expect(dynamicModule.exports).toEqual([PaymentsMongoPersistenceModule]);
  });

  it('fails startup through the migration verifier when the selected database has drifted', async () => {
    const database = {} as Db;

    await new PaymentsMongoMigrationVerifier(database).onModuleInit();

    expect(migrationMocks.verifyAppliedMongoMigrations).toHaveBeenCalledWith(database, paymentsMongoMigrations);
  });
});
