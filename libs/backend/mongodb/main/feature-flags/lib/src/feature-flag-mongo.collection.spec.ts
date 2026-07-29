import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import {
  FeatureFlagCollectionName,
  FeatureFlagCollectionValidator,
  FeatureFlagEnabledIndexName,
  FeatureFlagTenantKeyIndexName,
  initializeFeatureFlagCollection,
} from './feature-flag-mongo.collection';

function createDatabase() {
  const createIndexes = vi.fn().mockResolvedValue([]);
  const createCollection = vi.fn().mockResolvedValue(undefined);
  const command = vi.fn().mockResolvedValue({ ok: 1 });
  const collection = vi.fn(() => ({ createIndexes }));
  const database = { createCollection, command, collection } as unknown as Db;
  return { collection, command, createCollection, createIndexes, database };
}

describe('feature flag MongoDB collection initialization', () => {
  it('creates a strictly validated collection and the tenant-scoped indexes', async () => {
    const fixture = createDatabase();

    await initializeFeatureFlagCollection(fixture.database);

    expect(fixture.createCollection).toHaveBeenCalledWith(FeatureFlagCollectionName, {
      validator: FeatureFlagCollectionValidator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
    expect(fixture.command).not.toHaveBeenCalled();
    expect(fixture.createIndexes).toHaveBeenCalledWith([
      expect.objectContaining({ name: FeatureFlagTenantKeyIndexName, unique: true }),
      expect.objectContaining({ name: FeatureFlagEnabledIndexName }),
    ]);
  });

  it('refreshes validation and indexes when the collection already exists', async () => {
    const fixture = createDatabase();
    fixture.createCollection.mockRejectedValue({ code: 48 });

    await initializeFeatureFlagCollection(fixture.database);

    expect(fixture.command).toHaveBeenCalledWith({
      collMod: FeatureFlagCollectionName,
      validator: FeatureFlagCollectionValidator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
    expect(fixture.createIndexes).toHaveBeenCalledOnce();
  });

  it('preserves unexpected collection initialization failures', async () => {
    const fixture = createDatabase();
    fixture.createCollection.mockRejectedValue(new Error('permission denied'));

    await expect(initializeFeatureFlagCollection(fixture.database)).rejects.toThrow('permission denied');
    expect(fixture.createIndexes).not.toHaveBeenCalled();
  });
});
