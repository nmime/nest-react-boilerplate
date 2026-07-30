// @requirements REQ-AUTH-PERSISTENCE-007
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AuthUserTokenEntity } from '../entities';
import { AuthTokenRepository } from './auth-token.repository';

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve(null));
  const nativeDelete = vi.fn(() => Promise.resolve(0));
  const entityManager = {
    persist,
    flush,
    findOne,
    nativeDelete,
    transactional: vi.fn((callback: (em: EntityManager) => unknown) => Promise.resolve(callback(entityManager))),
  } as unknown as EntityManager;
  return { persist, flush, findOne, nativeDelete, entityManager };
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-06-01T00:00:00.000Z');
const expiresAt = new Date('2026-07-01T00:00:00.000Z');

describe('AuthTokenRepository', () => {
  it('persists and consumes a tenant-bound user action token once', async () => {
    const { persist, flush, findOne, entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);
    const created = await repository.createUserToken({
      id: '66666666-6666-4666-8666-666666666666',
      tenantId,
      userId,
      purpose: 'password_reset',
      tokenHash: 'action-hash',
      expiresAt,
    });

    expect(created._unsafeUnwrap()).toMatchObject({
      tenantId,
      purpose: 'password_reset',
      tokenHash: 'action-hash',
      consumedAt: null,
    });
    expect(persist).toHaveBeenCalledTimes(1);

    const actionToken = new AuthUserTokenEntity();
    findOne.mockResolvedValue(actionToken);
    const consumed = await repository.consumeUserToken('action-hash', 'password_reset', tenantId, now);
    expect(consumed._unsafeUnwrap()).toBe(actionToken);
    expect(actionToken.consumedAt).toBe(now);
    expect(findOne).toHaveBeenCalledWith(
      AuthUserTokenEntity,
      {
        tokenHash: 'action-hash',
        purpose: 'password_reset',
        tenantId,
        consumedAt: null,
        expiresAt: { $gt: now },
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('returns null when a user action token is not usable', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    const result = await new AuthTokenRepository(entityManager).consumeUserToken('missing', 'email_verification');
    expect(result._unsafeUnwrap()).toBeNull();
    expect(flush).not.toHaveBeenCalled();
  });

  it('cleans expired user-action rows', async () => {
    const { nativeDelete, entityManager } = createEntityManagerMock();
    nativeDelete.mockResolvedValueOnce(3);
    const result = await new AuthTokenRepository(entityManager).cleanupExpiredTokens(now);
    expect(result._unsafeUnwrap()).toEqual({ userTokensDeleted: 3 });
    expect(nativeDelete).toHaveBeenCalledWith(AuthUserTokenEntity, { expiresAt: { $lte: now } });
  });

  it('maps database failures to the stable repository error', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue(new Error('database unavailable'));
    const result = await new AuthTokenRepository(entityManager).consumeUserToken('hash', 'email_verification');
    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'database unavailable',
    });
  });
});
