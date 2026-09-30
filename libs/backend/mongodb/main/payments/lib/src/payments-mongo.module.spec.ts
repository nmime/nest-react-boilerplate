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
import { MongoDatabaseToken, MongoMainModule } from '@app/backend-mongodb-main';
import { Global, Module } from '@nestjs/common';
// nx-ignore-next-line -- This composition test is not a runtime package dependency.
import { Test, type TestingModule } from '@nestjs/testing';
import {
  PaymentsMongoMigrationVerifier,
  PaymentsMongoModule,
  PaymentsMongoPersistenceModule,
} from './payments-mongo.module';
import { PaymentsMongoPersistence } from './payments-mongo.repository';
import { paymentsMongoMigrations } from './migrations';

describe('PaymentsMongoModule', () => {
  it('resolves the persistence port without an optional observer under production constructor metadata', async () => {
    const database = { collection: vi.fn(() => ({ find: () => ({ toArray: async () => [] }) })) } as unknown as Db;
    class MongoDatabaseFixtureModule {}
    Global()(MongoDatabaseFixtureModule);
    Module({
      providers: [{ provide: MongoDatabaseToken, useValue: database }],
      exports: [MongoDatabaseToken],
    })(MongoDatabaseFixtureModule);

    // Vite omits design:paramtypes. Use the interface metadata emitted by
    // production tsc so this test cannot hide a missing optional DI binding.
    const metadata = Reflect.getMetadata('design:paramtypes', PaymentsMongoPersistence) as unknown;
    Reflect.defineMetadata('design:paramtypes', [Object, Object], PaymentsMongoPersistence);
    let module: TestingModule | undefined;
    try {
      module = await Test.createTestingModule({
        imports: [MongoDatabaseFixtureModule, PaymentsMongoPersistenceModule],
      }).compile();
      await module.init();
      const persistence = module.get(PaymentsPersistence);
      expect(persistence).toBe(module.get(PaymentsMongoPersistence));
      await expect(persistence.listPayments()).resolves.toEqual([]);
    } finally {
      await module?.close();
      if (metadata === undefined) {
        Reflect.deleteMetadata('design:paramtypes', PaymentsMongoPersistence);
      } else {
        Reflect.defineMetadata('design:paramtypes', metadata, PaymentsMongoPersistence);
      }
    }
  });

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
