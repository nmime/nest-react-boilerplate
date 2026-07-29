import type { Collection, Db } from 'mongodb';
import { DefaultFeatureFlagTenantId } from '@app/common-feature-flags';
import { describe, expect, it, vi } from 'vitest';
import type { FeatureFlagDocument } from './feature-flag-mongo.types';
import { MongoFeatureFlagRepository, resolveMongoFeatureFlagTenantId } from './feature-flag-mongo.repository';

const tenantId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-07-26T00:00:00.000Z');

function document(overrides: Partial<FeatureFlagDocument> = {}): FeatureFlagDocument {
  return {
    _id: '00000000-0000-4000-8000-000000000010',
    tenantId,
    key: 'checkout.newflow',
    value: true,
    description: 'New checkout',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRepository() {
  const toArray = vi.fn().mockResolvedValue([]);
  const sort = vi.fn(() => ({ toArray }));
  const find = vi.fn(() => ({ sort }));
  const findOne = vi.fn().mockResolvedValue(null);
  const findOneAndUpdate = vi.fn().mockResolvedValue(document());
  const collection = { find, findOne, findOneAndUpdate } as unknown as Collection<FeatureFlagDocument>;
  const database = { collection: vi.fn(() => collection) } as unknown as Db;
  return {
    find,
    findOne,
    findOneAndUpdate,
    repository: new MongoFeatureFlagRepository(database),
    sort,
    toArray,
  };
}

describe('MongoFeatureFlagRepository', () => {
  it('gets a flag by tenant-scoped key without exposing the Mongo document shape', async () => {
    const fixture = createRepository();
    fixture.findOne.mockResolvedValue(document());

    const result = await fixture.repository.findByKey('checkout.newflow', tenantId);

    expect(result._unsafeUnwrap()).toEqual({
      id: '00000000-0000-4000-8000-000000000010',
      tenantId,
      key: 'checkout.newflow',
      value: true,
      description: 'New checkout',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(fixture.findOne).toHaveBeenCalledWith({ key: 'checkout.newflow', tenantId }, { session: undefined });
  });

  it('returns null for a missing flag and defaults the tenant', async () => {
    const fixture = createRepository();

    const result = await fixture.repository.findByKey('checkout.newflow');

    expect(result._unsafeUnwrap()).toBeNull();
    expect(fixture.findOne).toHaveBeenCalledWith(
      {
        key: 'checkout.newflow',
        tenantId: DefaultFeatureFlagTenantId,
      },
      { session: undefined },
    );
  });

  it('lists tenant flags in key order', async () => {
    const fixture = createRepository();
    fixture.toArray.mockResolvedValue([document()]);

    const result = await fixture.repository.list({ tenantId });

    expect(result._unsafeUnwrap()).toHaveLength(1);
    expect(fixture.find).toHaveBeenCalledWith({ tenantId }, { session: undefined });
    expect(fixture.sort).toHaveBeenCalledWith({ key: 1 });
  });

  it('builds enabled-only snapshots for the selected tenant', async () => {
    const fixture = createRepository();
    fixture.toArray.mockResolvedValue([
      document(),
      document({ _id: '00000000-0000-4000-8000-000000000011', key: 'rollout.percent', value: 25 }),
    ]);

    const result = await fixture.repository.getSnapshot({ tenantId });

    expect(result._unsafeUnwrap()).toEqual({
      source: 'mongodb',
      values: { 'checkout.newflow': true, 'rollout.percent': 25 },
    });
    expect(fixture.find).toHaveBeenCalledWith({ enabled: true, tenantId });
  });

  it('atomically upserts a new flag with defaults', async () => {
    const fixture = createRepository();

    const result = await fixture.repository.upsert({ tenantId, key: 'checkout.newflow', value: true });

    expect(result._unsafeUnwrap()).toMatchObject({ key: 'checkout.newflow', tenantId, value: true });
    expect(fixture.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId, key: 'checkout.newflow' },
      {
        $set: { value: true, updatedAt: expect.any(Date) },
        $setOnInsert: {
          _id: expect.any(String),
          tenantId,
          key: 'checkout.newflow',
          createdAt: expect.any(Date),
          description: '',
          enabled: true,
        },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false, session: undefined },
    );
  });

  it('uses the supplied MongoDB session for audited reads and writes', async () => {
    const fixture = createRepository();
    const session = { startTransaction: vi.fn() } as unknown as import('mongodb').ClientSession;

    await fixture.repository.findByKey('checkout.newflow', tenantId, session);
    await fixture.repository.list({ tenantId }, session);
    await fixture.repository.upsert({ tenantId, key: 'checkout.newflow', value: true }, session);

    expect(fixture.findOne).toHaveBeenCalledWith(expect.anything(), { session });
    expect(fixture.find).toHaveBeenCalledWith(expect.anything(), { session });
    expect(fixture.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ session }),
    );
  });

  it('preserves a description for null updates and applies explicit optional fields atomically', async () => {
    const fixture = createRepository();

    await fixture.repository.upsert({
      tenantId,
      key: 'checkout.newflow',
      value: 'on',
      description: null,
      enabled: false,
    });

    expect(fixture.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      {
        $set: { value: 'on', updatedAt: expect.any(Date), enabled: false },
        $setOnInsert: {
          _id: expect.any(String),
          tenantId,
          key: 'checkout.newflow',
          createdAt: expect.any(Date),
          description: '',
        },
      },
      expect.anything(),
    );

    await fixture.repository.upsert({
      tenantId,
      key: 'checkout.newflow',
      value: true,
      description: 'Explicit description',
    });
    expect(fixture.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({ description: 'Explicit description' }),
        $setOnInsert: expect.not.objectContaining({ description: expect.anything() }),
      }),
      expect.anything(),
    );
  });

  it('maps validation, driver, empty-upsert, and non-Error failures to repository errors', async () => {
    const fixture = createRepository();

    expect((await fixture.repository.findByKey('Invalid Key', tenantId))._unsafeUnwrapErr()).toMatchObject({
      code: 'repository_error',
    });
    expect((await fixture.repository.list({ tenantId: 'not-a-uuid' }))._unsafeUnwrapErr()).toMatchObject({
      message: 'Feature flag tenant IDs must be UUIDs.',
    });
    expect(
      (await fixture.repository.upsert({ tenantId, key: 'checkout.newflow', value: Number.NaN }))._unsafeUnwrapErr(),
    ).toMatchObject({ message: 'Feature flag numeric values must be finite.' });

    fixture.findOne.mockRejectedValueOnce('connection reset');
    expect((await fixture.repository.findByKey('checkout.newflow', tenantId))._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Feature flag repository failed.',
    });

    fixture.findOneAndUpdate.mockResolvedValueOnce(null);
    expect(
      (await fixture.repository.upsert({ tenantId, key: 'checkout.newflow', value: true }))._unsafeUnwrapErr(),
    ).toMatchObject({ message: 'MongoDB feature flag upsert returned no document.' });
  });

  it('resolves explicit and default tenant contexts', () => {
    expect(resolveMongoFeatureFlagTenantId({ tenantId })).toBe(tenantId);
    expect(resolveMongoFeatureFlagTenantId()).toBe(DefaultFeatureFlagTenantId);
  });
});
