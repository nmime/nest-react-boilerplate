// @requirements REQ-RUNTIME-DATABASE-008
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient } from 'mongodb';
import { runInMongoTransaction } from '@app/backend-mongodb-main';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FeatureFlagCollectionName, initializeFeatureFlagCollection } from './feature-flag-mongo.collection';
import { MongoFeatureFlagRepository } from './feature-flag-mongo.repository';
import type { FeatureFlagDocument } from './feature-flag-mongo.types';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';

describe('MongoDB feature flag persistence', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;
  let repository: MongoFeatureFlagRepository;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const connectionString = container.getConnectionString();
    const separator = connectionString.includes('?') ? '&' : '?';
    client = new MongoClient(`${connectionString}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
    const database = client.db('feature_flags_component');
    await initializeFeatureFlagCollection(database);
    repository = new MongoFeatureFlagRepository(database);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  it('enforces tenant-scoped uniqueness while allowing the same key in another tenant', async () => {
    const [first, second] = await Promise.all([
      repository.upsert({ tenantId: tenantA, key: 'checkout.newflow', value: true, description: 'Checkout' }),
      repository.upsert({ tenantId: tenantA, key: 'checkout.newflow', value: 'on' }),
    ]);
    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    const existing = (await repository.list({ tenantId: tenantA }))._unsafeUnwrap();
    expect(existing).toHaveLength(1);
    expect(existing[0]).toMatchObject({ description: 'Checkout' });

    const updated = (
      await repository.upsert({ tenantId: tenantA, key: 'checkout.newflow', value: false, description: null })
    )._unsafeUnwrap();
    expect(updated).toMatchObject({
      id: existing[0]?.id,
      createdAt: existing[0]?.createdAt,
      description: 'Checkout',
      value: false,
    });

    expect((await repository.upsert({ tenantId: tenantB, key: 'checkout.newflow', value: false })).isOk()).toBe(true);
    expect((await repository.list({ tenantId: tenantB }))._unsafeUnwrap()).toHaveLength(1);

    const indexes = await client.db('feature_flags_component').collection(FeatureFlagCollectionName).indexes();
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(['uq__feature_flags__tenant_id_key', 'ix__feature_flags__tenant_id_enabled_key']),
    );
  });

  it('lists, gets, updates, and snapshots only enabled tenant flags', async () => {
    await repository.upsert({ tenantId: tenantA, key: 'rollout.percent', value: 25 });
    await repository.upsert({ tenantId: tenantA, key: 'checkout.newflow', value: false, enabled: false });

    expect((await repository.findByKey('rollout.percent', tenantA))._unsafeUnwrap()).toMatchObject({ value: 25 });
    expect((await repository.getSnapshot({ tenantId: tenantA }))._unsafeUnwrap()).toEqual({
      source: 'mongodb',
      values: { 'rollout.percent': 25 },
    });
  });

  it('rejects documents that bypass repository validation', async () => {
    const collection = client.db('feature_flags_component').collection<FeatureFlagDocument>(FeatureFlagCollectionName);
    await expect(
      collection.insertOne({
        _id: 'invalid',
        tenantId: tenantA,
        key: 'INVALID KEY',
        value: true,
        description: '',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();

    await expect(
      collection.insertOne({
        _id: 'invalid-number',
        tenantId: tenantA,
        key: 'checkout.invalidnumber',
        value: Number.NaN,
        description: '',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('rolls back a feature flag write with its owning audit transaction', async () => {
    await expect(
      runInMongoTransaction(client, async (session) => {
        const result = await repository.upsert({ tenantId: tenantA, key: 'audit.rollback', value: true }, session);
        if (result.isErr()) {
          throw new Error(result.error.message);
        }
        throw new Error('audit failed');
      }),
    ).rejects.toThrow('audit failed');

    expect(
      await client
        .db('feature_flags_component')
        .collection(FeatureFlagCollectionName)
        .countDocuments({ tenantId: tenantA, key: 'audit.rollback' }),
    ).toBe(0);
  });
});
