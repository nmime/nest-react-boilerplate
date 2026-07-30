// @requirements REQ-RUNTIME-DATABASE-008
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInMongoTransaction } from './mongo.transaction';
import { assertMongoTransactionTopology } from './mongo.topology';

describe('MongoDB replica-set transactions', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const separator = container.getConnectionString().includes('?') ? '&' : '?';
    client = new MongoClient(`${container.getConnectionString()}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  it('connects to a writable transaction-capable replica set', async () => {
    await expect(assertMongoTransactionTopology(client)).resolves.toMatchObject({ kind: 'replica_set' });
  });

  it('commits mutation, audit, and outbox documents atomically', async () => {
    const database = client.db('transaction_commit');

    await runInMongoTransaction(client, async (session) => {
      await database.collection('users').insertOne({ id: 'user-1', enabled: true }, { session });
      await database.collection('audit').insertOne({ id: 'audit-1', targetId: 'user-1' }, { session });
      await database.collection('outbox').insertOne({ id: 'event-1', aggregateId: 'user-1' }, { session });
    });

    await expect(
      Promise.all(['users', 'audit', 'outbox'].map((name) => database.collection(name).countDocuments())),
    ).resolves.toEqual([1, 1, 1]);
  });

  it('rolls back every document when a transactional mutation fails', async () => {
    const database = client.db('transaction_rollback');

    await expect(
      runInMongoTransaction(client, async (session) => {
        await database.collection('users').insertOne({ id: 'user-1' }, { session });
        await database.collection('audit').insertOne({ id: 'audit-1' }, { session });
        await database.collection('outbox').insertOne({ id: 'event-1' }, { session });
        throw new Error('reject mutation');
      }),
    ).rejects.toThrow('reject mutation');

    await expect(
      Promise.all(['users', 'audit', 'outbox'].map((name) => database.collection(name).countDocuments())),
    ).resolves.toEqual([0, 0, 0]);
  });

  it('retries write conflicts without losing concurrent updates', async () => {
    const counters = client.db('transaction_concurrency').collection<{ id: string; value: number }>('counters');
    await counters.insertOne({ id: 'shared', value: 0 });

    const increment = () =>
      runInMongoTransaction(client, async (session) => {
        const current = await counters.findOne({ id: 'shared' }, { session });
        await new Promise((resolve) => setTimeout(resolve, 25));
        await counters.updateOne({ id: 'shared' }, { $set: { value: (current?.value ?? 0) + 1 } }, { session });
      });

    await Promise.all([increment(), increment()]);

    await expect(counters.findOne({ id: 'shared' })).resolves.toMatchObject({ value: 2 });
  });
});
