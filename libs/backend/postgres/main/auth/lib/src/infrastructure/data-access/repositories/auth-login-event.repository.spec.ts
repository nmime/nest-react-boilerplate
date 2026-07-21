import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AuthLoginEventEntity, DefaultAuthTenantId, TransactionalOutboxEventEntity } from '../entities';
import { AuthLoginEventRepository } from './auth-login-event.repository';

const createManager = () => {
  const persist = vi.fn();
  const flush = vi.fn(() => Promise.resolve());
  const find = vi.fn(() => Promise.resolve([]));
  const count = vi.fn(() => Promise.resolve(0));
  const nativeUpdate = vi.fn(() => Promise.resolve(2));
  const nativeDelete = vi.fn(() => Promise.resolve(1));
  const execute = vi
    .fn()
    .mockResolvedValueOnce([{ total: '4', successful: '3', failed: '1', uniqueUsers: '2' }])
    .mockResolvedValueOnce([{ key: 'UZ', count: '2' }])
    .mockResolvedValueOnce([{ key: 'en', count: '3' }])
    .mockResolvedValueOnce([{ key: 'Asia/Tashkent', count: '2' }])
    .mockResolvedValueOnce([{ key: 'telegram', count: '4' }]);
  const manager = {
    persist,
    flush,
    find,
    count,
    nativeUpdate,
    nativeDelete,
    getConnection: () => ({ execute }),
  } as unknown as EntityManager;
  const transactional = vi.fn(async (handler: (em: EntityManager) => Promise<unknown>) => handler(manager));
  Object.assign(manager, { transactional });
  return { manager, persist, flush, find, count, nativeUpdate, nativeDelete, execute, transactional };
};

describe('AuthLoginEventRepository', () => {
  it('persists the login event and matching outbox in one transaction', async () => {
    const { manager, persist, flush } = createManager();
    const result = await new AuthLoginEventRepository(manager).record({
      eventType: 'login',
      outcome: 'success',
      provider: 'password',
      channel: 'password',
      requestId: 'req-1',
    });
    const event = result._unsafeUnwrap();
    expect(event).toBeInstanceOf(AuthLoginEventEntity);
    expect(persist).toHaveBeenCalledWith(event);
    expect(persist).toHaveBeenCalledWith(expect.any(TransactionalOutboxEventEntity));
    expect(flush).toHaveBeenCalledOnce();
  });

  it('lists, counts, and aggregates every supported tenant-scoped filter', async () => {
    const { manager, find, count, execute } = createManager();
    const repository = new AuthLoginEventRepository(manager);
    const filter = {
      tenantId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
      outcome: 'success' as const,
      provider: 'telegram',
      countryCode: 'UZ',
      language: 'en',
      timezone: 'Asia/Tashkent',
      occurredFrom: new Date('2026-07-01T00:00:00.000Z'),
      occurredTo: new Date('2026-07-22T00:00:00.000Z'),
      limit: 200,
      offset: -1,
    };
    await repository.list(filter);
    await repository.count(filter);
    const summary = (await repository.summary(filter))._unsafeUnwrap();
    expect(find).toHaveBeenCalledWith(
      AuthLoginEventEntity,
      expect.objectContaining({ tenantId: filter.tenantId, countryCode: 'UZ' }),
      { limit: 100, offset: 0, orderBy: { occurredAt: 'DESC', id: 'DESC' } },
    );
    expect(count).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(5);
    expect(summary).toMatchObject({
      total: 4,
      successful: 3,
      failed: 1,
      uniqueUsers: 2,
      successRate: 75,
      byCountry: [{ key: 'UZ', count: 2 }],
    });
  });

  it('anonymizes exact network evidence before deleting expired events', async () => {
    const { manager, nativeUpdate, nativeDelete } = createManager();
    await expect(
      new AuthLoginEventRepository(manager).applyRetention({
        anonymizeBefore: new Date('2026-06-01T00:00:00.000Z'),
        deleteBefore: new Date('2025-07-01T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ anonymized: 2, deleted: 1 });
    expect(nativeUpdate).toHaveBeenCalledWith(
      AuthLoginEventEntity,
      expect.objectContaining({ tenantId: DefaultAuthTenantId }),
      expect.objectContaining({ ipAddress: null, userAgent: null }),
    );
    expect(nativeDelete).toHaveBeenCalled();
  });

  it('maps persistence failures into repository errors', async () => {
    const { manager, flush } = createManager();
    flush.mockRejectedValueOnce(new Error('database unavailable'));
    const result = await new AuthLoginEventRepository(manager).record({
      eventType: 'login',
      outcome: 'failure',
      provider: 'password',
      channel: 'password',
    });
    expect(result._unsafeUnwrapErr()).toMatchObject({ code: 'repository_error', message: 'database unavailable' });
  });
});
