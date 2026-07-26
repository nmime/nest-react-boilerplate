// @requirements REQ-NOTIFY-PREFERENCE-006
import { Logger } from '@nestjs/common';
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { FeatureFlagEntity } from './infrastructure/data-access/entities';
import { PostgresFeatureFlagProvider } from './feature-flag-postgres.service';
import type { FeatureFlagRepository } from './infrastructure/data-access/repositories';

function createRepositoryMock(flags: Record<string, FeatureFlagEntity | null>) {
  return {
    findByKey: vi.fn((key: string) => okAsync(flags[key] ?? null)),
    getSnapshot: vi.fn(() =>
      okAsync({
        source: 'postgres',
        values: Object.fromEntries(
          Object.entries(flags)
            .filter(([, flag]) => flag?.enabled === true)
            .map(([key, flag]) => [key, flag?.value]),
        ),
      }),
    ),
  } as unknown as FeatureFlagRepository;
}

describe('PostgresFeatureFlagProvider', () => {
  it('evaluates enabled feature flags from the repository', async () => {
    const repository = createRepositoryMock({
      'billing.portal': new FeatureFlagEntity({
        key: 'billing.portal',
        value: 'on',
      }),
      'admin.audit': new FeatureFlagEntity({
        key: 'admin.audit',
        value: true,
        enabled: false,
      }),
    });
    const provider = new PostgresFeatureFlagProvider(repository);

    await expect(provider.isEnabled('billing.portal')).resolves.toBe(true);
    await expect(provider.isEnabled('admin.audit')).resolves.toBe(false);
    await expect(provider.isEnabled('missing')).resolves.toBe(false);
    await expect(provider.getValue('billing.portal', 'off')).resolves.toBe('on');
    await expect(provider.getValue('missing', 0)).resolves.toBe(0);
  });

  it('returns the fallback when the persisted value type does not match', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = createRepositoryMock({
      'rollout.percent': new FeatureFlagEntity({
        key: 'rollout.percent',
        value: 25,
      }),
    });
    const provider = new PostgresFeatureFlagProvider(repository);

    try {
      await expect(provider.getValue('rollout.percent', 'default')).resolves.toBe('default');
      await expect(provider.getValue('rollout.percent', 0)).resolves.toBe(25);
      expect(warnSpy).toHaveBeenCalledWith(
        'Feature flag "rollout.percent" is a number but the fallback is a string; using fallback.',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('coerces boolean-like literals when the fallback is a boolean', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const repository = createRepositoryMock({
      'billing.portal': new FeatureFlagEntity({
        key: 'billing.portal',
        value: 'on',
      }),
      'billing.disabled': new FeatureFlagEntity({
        key: 'billing.disabled',
        value: 'off',
      }),
    });
    const provider = new PostgresFeatureFlagProvider(repository);

    try {
      // getValue agrees with isEnabled for the same string-stored flag.
      await expect(provider.isEnabled('billing.portal')).resolves.toBe(true);
      await expect(provider.getValue('billing.portal', false)).resolves.toBe(true);
      await expect(provider.getValue('billing.disabled', true)).resolves.toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('returns DB snapshots', async () => {
    const repository = createRepositoryMock({
      'rollout.percent': new FeatureFlagEntity({
        key: 'rollout.percent',
        value: 25,
      }),
    });
    const provider = new PostgresFeatureFlagProvider(repository);

    await expect(provider.getSnapshot()).resolves.toEqual({
      source: 'postgres',
      values: { 'rollout.percent': 25 },
    });
  });

  it('falls back safely when the repository fails', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const repository = {
      findByKey: vi.fn(() => errAsync({ code: 'repository_error', message: 'db down' })),
      getSnapshot: vi.fn(() => errAsync({ code: 'repository_error', message: 'db down' })),
    } as unknown as FeatureFlagRepository;
    const provider = new PostgresFeatureFlagProvider(repository);

    try {
      await expect(provider.isEnabled('billing.portal')).resolves.toBe(false);
      await expect(provider.getValue('billing.portal', 'off')).resolves.toBe('off');
      await expect(provider.getSnapshot()).resolves.toEqual({
        source: 'postgres',
        values: {},
      });

      // A DB outage must be observable, not silently indistinguishable from an unset flag.
      expect(errorSpy).toHaveBeenCalledWith('Failed to evaluate feature flag "billing.portal": db down');
      expect(errorSpy).toHaveBeenCalledWith('Failed to load feature flag snapshot: db down');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('forwards the tenant context to the repository', async () => {
    const findByKey = vi.fn(() => okAsync(new FeatureFlagEntity({ key: 'billing.portal', value: true })));
    const getSnapshot = vi.fn(() => okAsync({ source: 'postgres' as const, values: {} }));
    const repository = {
      findByKey,
      getSnapshot,
    } as unknown as FeatureFlagRepository;
    const provider = new PostgresFeatureFlagProvider(repository);
    const context = { tenantId: '00000000-0000-4000-8000-000000000001' };

    await provider.isEnabled('billing.portal', context);
    await provider.getValue('billing.portal', false, context);
    await provider.getSnapshot(context);

    expect(findByKey).toHaveBeenCalledWith('billing.portal', context.tenantId);
    expect(getSnapshot).toHaveBeenCalledWith(context);
  });
});
