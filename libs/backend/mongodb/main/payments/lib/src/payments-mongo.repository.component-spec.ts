// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-WEBHOOK-002
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { runMongoMigrations } from '../../../shared/lib/src/migrations/mongo-migration';
import { PaymentsCreatedAtIndexName, PaymentsCollectionName } from './payments-mongo.collection';
import { PaymentsRepository } from './payments-mongo.repository';
import { paymentsMongoMigrations } from './migrations';

describe('MongoDB payments persistence', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;
  let repository: PaymentsRepository;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const connectionString = container.getConnectionString();
    const separator = connectionString.includes('?') ? '&' : '?';
    client = new MongoClient(connectionString + separator + 'directConnection=true&replicaSet=rs0');
    await client.connect();
    const database = client.db('payments_component');
    await expect(runMongoMigrations(database, paymentsMongoMigrations)).resolves.toEqual({
      applied: ['20260823100000_initialize_payments'],
      skipped: [],
    });
    await expect(runMongoMigrations(database, paymentsMongoMigrations)).resolves.toEqual({
      applied: [],
      skipped: ['20260823100000_initialize_payments'],
    });
    repository = new PaymentsRepository(database, client);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  it('atomically creates and lists multiple documents with the canonical index', async () => {
    expect((await repository.createMany(['First', 'Second'])).isOk()).toBe(true);
    expect((await repository.list())._unsafeUnwrap()).toHaveLength(2);
    const indexes = await client.db('payments_component').collection(PaymentsCollectionName).indexes();
    expect(indexes.map((index) => index.name)).toContain(PaymentsCreatedAtIndexName);
  });
});
