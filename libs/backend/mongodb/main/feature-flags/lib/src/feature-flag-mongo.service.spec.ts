import { Logger } from '@nestjs/common';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { MongoFeatureFlag } from './feature-flag-mongo.types';
import type { MongoFeatureFlagRepository } from './feature-flag-mongo.repository';
import { MongoFeatureFlagProvider } from './feature-flag-mongo.service';

const now = new Date('2026-07-26T00:00:00.000Z');

function flag(value: MongoFeatureFlag['value'], enabled = true): MongoFeatureFlag {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    tenantId: '00000000-0000-4000-8000-000000000001',
    key: 'checkout.newflow',
    value,
    description: '',
    enabled,
    createdAt: now,
    updatedAt: now,
  };
}

function repository(value: MongoFeatureFlag | null) {
  return {
    findByKey: vi.fn(() => okAsync(value)),
    getSnapshot: vi.fn(() => okAsync({ source: 'mongodb', values: value ? { [value.key]: value.value } : {} })),
  } as unknown as MongoFeatureFlagRepository;
}

describe('MongoFeatureFlagProvider', () => {
  it('evaluates enabled flags, boolean-like values, disabled flags, and missing flags', async () => {
    await expect(new MongoFeatureFlagProvider(repository(flag('on'))).isEnabled('checkout.newflow')).resolves.toBe(
      true,
    );
    await expect(
      new MongoFeatureFlagProvider(repository(flag(true, false))).isEnabled('checkout.newflow'),
    ).resolves.toBe(false);
    await expect(new MongoFeatureFlagProvider(repository(null)).isEnabled('missing')).resolves.toBe(false);
    await expect(
      new MongoFeatureFlagProvider(repository(flag('off'))).getValue('checkout.newflow', true),
    ).resolves.toBe(false);
  });

  it('returns matching values and falls back for disabled, missing, or mismatched values', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await expect(new MongoFeatureFlagProvider(repository(flag(25))).getValue('rollout.percent', 0)).resolves.toBe(25);
      await expect(new MongoFeatureFlagProvider(repository(flag(25))).getValue('rollout.percent', 'off')).resolves.toBe(
        'off',
      );
      await expect(
        new MongoFeatureFlagProvider(repository(flag(25, false))).getValue('rollout.percent', 0),
      ).resolves.toBe(0);
      await expect(new MongoFeatureFlagProvider(repository(null)).getValue('missing', 'off')).resolves.toBe('off');
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns MongoDB snapshots and forwards tenant context', async () => {
    const store = repository(flag(true));
    const provider = new MongoFeatureFlagProvider(store);
    const context = { tenantId: '00000000-0000-4000-8000-000000000001' };

    await expect(provider.getSnapshot(context)).resolves.toEqual({
      source: 'mongodb',
      values: { 'checkout.newflow': true },
    });
    await provider.isEnabled('checkout.newflow', context);
    expect(store.getSnapshot).toHaveBeenCalledWith(context);
    expect(store.findByKey).toHaveBeenCalledWith('checkout.newflow', context.tenantId);
  });

  it('fails closed and logs repository errors', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const store = {
      findByKey: vi.fn(() => errAsync({ code: 'repository_error' as const, message: 'db down' })),
      getSnapshot: vi.fn(() => errAsync({ code: 'repository_error' as const, message: 'db down' })),
    } as unknown as MongoFeatureFlagRepository;
    const provider = new MongoFeatureFlagProvider(store);

    try {
      await expect(provider.isEnabled('checkout.newflow')).resolves.toBe(false);
      await expect(provider.getValue('checkout.newflow', 'off')).resolves.toBe('off');
      await expect(provider.getSnapshot()).resolves.toEqual({ source: 'mongodb', values: {} });
      expect(error).toHaveBeenCalledWith('Failed to evaluate feature flag "checkout.newflow": db down');
      expect(error).toHaveBeenCalledWith('Failed to load feature flag snapshot: db down');
    } finally {
      error.mockRestore();
    }
  });
});
