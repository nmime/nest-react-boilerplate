import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AuthMethodEntity, DefaultAuthTenantId } from '../entities';
import { AuthMethodRepository } from './auth-method.repository';

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve<AuthMethodEntity | null>(null));
  const find = vi.fn(() => Promise.resolve<AuthMethodEntity[]>([]));
  const count = vi.fn(() => Promise.resolve(0));
  const entityManager = {
    persist,
    flush,
    findOne,
    find,
    count,
  } as unknown as EntityManager;

  return { persist, flush, findOne, find, count, entityManager };
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

describe('AuthMethodRepository', () => {
  it('inserts a new password method with derived amr and default tenant', async () => {
    const { persist, flush, findOne, entityManager } = createEntityManagerMock();
    const repository = new AuthMethodRepository(entityManager);

    const result = await repository.upsertMethod({
      userId,
      method: 'password',
    });

    const entity = result._unsafeUnwrap();
    expect(entity).toMatchObject({
      tenantId: DefaultAuthTenantId,
      userId,
      method: 'password',
      amr: ['pwd'],
      externalIdentityId: null,
    });
    expect(findOne).toHaveBeenCalledWith(AuthMethodEntity, {
      tenantId: DefaultAuthTenantId,
      userId,
      method: 'password',
      externalIdentityId: null,
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('derives the channel-specific amr for non-password methods', async () => {
    const { entityManager } = createEntityManagerMock();
    const repository = new AuthMethodRepository(entityManager);

    const result = await repository.upsertMethod({
      userId,
      method: 'discord_oauth',
    });

    expect(result._unsafeUnwrap().amr).toEqual(['discord_oauth']);
  });

  it('updates an existing method in place without re-persisting and honours explicit fields', async () => {
    const existing = new AuthMethodEntity();
    existing.lastUsedAt = new Date('2026-01-01T00:00:00.000Z');
    const { persist, flush, findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(existing);
    const repository = new AuthMethodRepository(entityManager);
    const lastUsedAt = new Date('2026-06-14T12:00:00.000Z');

    const result = await repository.upsertMethod({
      tenantId,
      userId,
      method: 'telegram_bot',
      amr: ['otp'],
      externalIdentityId: '33333333-3333-4333-8333-333333333333',
      lastUsedAt,
    });

    const entity = result._unsafeUnwrap();
    expect(entity).toBe(existing);
    expect(entity).toMatchObject({
      tenantId,
      amr: ['otp'],
      externalIdentityId: '33333333-3333-4333-8333-333333333333',
      lastUsedAt,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous lastUsedAt when the upsert omits it', async () => {
    const existing = new AuthMethodEntity();
    const previous = new Date('2026-01-01T00:00:00.000Z');
    existing.lastUsedAt = previous;
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(existing);
    const repository = new AuthMethodRepository(entityManager);

    const result = await repository.upsertMethod({
      tenantId,
      userId,
      method: 'telegram_bot',
    });

    expect(result._unsafeUnwrap().lastUsedAt).toBe(previous);
  });

  it('records last-used timestamps for an existing method', async () => {
    const entity = new AuthMethodEntity();
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const repository = new AuthMethodRepository(entityManager);
    const lastUsedAt = new Date('2026-06-14T12:00:00.000Z');

    const result = await repository.recordLastUsed('method-id', tenantId, lastUsedAt);

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(entity.lastUsedAt).toBe(lastUsedAt);
    expect(findOne).toHaveBeenCalledWith(AuthMethodEntity, {
      id: 'method-id',
      tenantId,
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('returns null when recording last-used for a missing method', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    const repository = new AuthMethodRepository(entityManager);

    const result = await repository.recordLastUsed('missing-id');

    expect(result._unsafeUnwrap()).toBeNull();
    expect(flush).not.toHaveBeenCalled();
  });

  it('lists methods for a user ordered by recent usage', async () => {
    const method = new AuthMethodEntity();
    const { find, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([method]);
    const repository = new AuthMethodRepository(entityManager);

    const result = await repository.findByUser(userId);

    expect(result._unsafeUnwrap()).toEqual([method]);
    expect(find).toHaveBeenCalledWith(
      AuthMethodEntity,
      { tenantId: DefaultAuthTenantId, userId },
      { orderBy: { lastUsedAt: 'DESC', createdAt: 'DESC' } },
    );
  });

  it('maps persistence failures to repository errors', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    flush.mockRejectedValue(new Error('method upsert failed'));
    const repository = new AuthMethodRepository(entityManager);

    const result = await repository.upsertMethod({
      userId,
      method: 'password',
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'method upsert failed',
    });
  });
});
