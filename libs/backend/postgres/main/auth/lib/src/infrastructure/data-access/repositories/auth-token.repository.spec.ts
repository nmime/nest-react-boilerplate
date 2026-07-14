import type { EntityManager } from '@mikro-orm/postgresql';
import { LockMode } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthRefreshTokenEntity, AuthUserTokenEntity, DefaultAuthTenantId } from '../entities';
import { AuthTokenRepository } from './auth-token.repository';

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve(null));
  const nativeDelete = vi.fn(() => Promise.resolve(0));
  const nativeUpdate = vi.fn(() => Promise.resolve(0));
  const transactional = vi.fn((callback: (em: EntityManager) => unknown) => Promise.resolve(callback(entityManager)));
  const entityManager = {
    persist,
    flush,
    findOne,
    nativeDelete,
    nativeUpdate,
    transactional,
  } as unknown as EntityManager;

  return {
    persist,
    flush,
    findOne,
    nativeDelete,
    nativeUpdate,
    transactional,
    entityManager,
  };
}

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-06-01T00:00:00.000Z');
const expiresAt = new Date('2026-07-01T00:00:00.000Z');

describe('AuthTokenRepository', () => {
  it('persists refresh tokens with tenant scoped hashes', async () => {
    const { persist, flush, entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.createRefreshToken({
      id: '33333333-3333-4333-8333-333333333333',
      tenantId,
      userId,
      tokenHash: 'hash',
      familyId: '44444444-4444-4444-8444-444444444444',
      expiresAt,
    });

    const entity = result._unsafeUnwrap();
    expect(entity).toMatchObject({
      tenantId,
      userId,
      tokenHash: 'hash',
      parentTokenId: null,
      expiresAt,
    });
    expect(persist).toHaveBeenCalledWith(entity);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('finds only usable refresh tokens', async () => {
    const entity = new AuthRefreshTokenEntity();
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.findUsableRefreshToken('hash', tenantId, now);

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(AuthRefreshTokenEntity, {
      tokenHash: 'hash',
      tenantId,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
  });

  it('atomically rotates refresh tokens and links replacements', async () => {
    const current = new AuthRefreshTokenEntity();
    current.id = '33333333-3333-4333-8333-333333333333';
    current.tenantId = tenantId;
    current.userId = userId;
    current.familyId = '44444444-4444-4444-8444-444444444444';
    const { findOne, persist, flush, transactional, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(current);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.rotateRefreshToken({
      tokenHash: 'old-hash',
      tenantId,
      replacement: {
        id: '55555555-5555-4555-8555-555555555555',
        tokenHash: 'new-hash',
        expiresAt,
      },
      now,
    });

    const replacement = result._unsafeUnwrap();
    expect(transactional).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith(
      AuthRefreshTokenEntity,
      {
        tokenHash: 'old-hash',
        tenantId,
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(current.revokedAt).toBe(now);
    expect(current.replacedByTokenId).toBe(replacement?.id);
    expect(replacement).toMatchObject({
      tenantId,
      userId,
      tokenHash: 'new-hash',
      parentTokenId: current.id,
      familyId: current.familyId,
      expiresAt,
    });
    expect(persist).toHaveBeenCalledWith(replacement);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('returns null when rotating a missing refresh token', async () => {
    const { persist, flush, nativeUpdate, entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.rotateRefreshToken({
      tokenHash: 'missing-hash',
      tenantId,
      replacement: {
        id: '55555555-5555-4555-8555-555555555555',
        tokenHash: 'new-hash',
        expiresAt,
      },
      now,
    });

    expect(result._unsafeUnwrap()).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(nativeUpdate).not.toHaveBeenCalled();
  });

  it('revokes the whole token family when a rotated token is replayed', async () => {
    const replayed = new AuthRefreshTokenEntity();
    replayed.id = '33333333-3333-4333-8333-333333333333';
    replayed.tenantId = tenantId;
    replayed.userId = userId;
    replayed.familyId = '44444444-4444-4444-8444-444444444444';
    replayed.revokedAt = new Date('2026-05-30T00:00:00.000Z');
    replayed.replacedByTokenId = '55555555-5555-4555-8555-555555555555';
    const { findOne, nativeUpdate, persist, entityManager } = createEntityManagerMock();
    // First lookup (usable token) misses; second lookup finds the revoked token.
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(replayed);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.rotateRefreshToken({
      tokenHash: 'replayed-hash',
      tenantId,
      replacement: {
        id: '66666666-6666-4666-8666-666666666666',
        tokenHash: 'new-hash',
        expiresAt,
      },
      now,
    });

    expect(result._unsafeUnwrap()).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    expect(nativeUpdate).toHaveBeenCalledWith(
      AuthRefreshTokenEntity,
      { familyId: replayed.familyId, tenantId, revokedAt: null },
      { revokedAt: now },
    );
  });

  it('revokes usable refresh tokens', async () => {
    const current = new AuthRefreshTokenEntity();
    const { findOne, flush, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(current);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.revokeRefreshToken('hash', tenantId, now);

    expect(result._unsafeUnwrap()).toBe(true);
    expect(current.revokedAt).toBe(now);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('persists and consumes user action tokens once', async () => {
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

  it('cleans up expired refresh and action tokens', async () => {
    const { nativeDelete, entityManager } = createEntityManagerMock();
    nativeDelete.mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.cleanupExpiredTokens(now);

    expect(result._unsafeUnwrap()).toEqual({
      refreshTokensDeleted: 2,
      userTokensDeleted: 3,
    });
    expect(nativeDelete).toHaveBeenNthCalledWith(1, AuthRefreshTokenEntity, {
      expiresAt: { $lte: now },
    });
    expect(nativeDelete).toHaveBeenNthCalledWith(2, AuthUserTokenEntity, {
      expiresAt: { $lte: now },
    });
  });

  it('defaults the tenant and preserves an explicit parent token id', async () => {
    const { entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.createRefreshToken({
      id: '33333333-3333-4333-8333-333333333333',
      userId,
      tokenHash: 'hash',
      familyId: '44444444-4444-4444-8444-444444444444',
      parentTokenId: '77777777-7777-4777-8777-777777777777',
      expiresAt,
    });

    const entity = result._unsafeUnwrap();
    expect(entity.tenantId).toBe(DefaultAuthTenantId);
    expect(entity.parentTokenId).toBe('77777777-7777-4777-8777-777777777777');
  });

  it('rotates using the default tenant and clock when omitted', async () => {
    const current = new AuthRefreshTokenEntity();
    current.id = '33333333-3333-4333-8333-333333333333';
    current.tenantId = DefaultAuthTenantId;
    current.userId = userId;
    current.familyId = '44444444-4444-4444-8444-444444444444';
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(current);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.rotateRefreshToken({
      tokenHash: 'old-hash',
      replacement: {
        id: '55555555-5555-4555-8555-555555555555',
        tokenHash: 'new-hash',
        expiresAt,
      },
    });

    expect(result._unsafeUnwrap()).not.toBeNull();
  });

  it('does not revoke the family when the replayed token is still active', async () => {
    const replayed = new AuthRefreshTokenEntity();
    replayed.revokedAt = null;
    const { findOne, nativeUpdate, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(replayed);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.rotateRefreshToken({
      tokenHash: 'missing-hash',
      tenantId,
      replacement: {
        id: '55555555-5555-4555-8555-555555555555',
        tokenHash: 'new-hash',
        expiresAt,
      },
      now,
    });

    expect(result._unsafeUnwrap()).toBeNull();
    expect(nativeUpdate).not.toHaveBeenCalled();
  });

  it('defaults the tenant for user action tokens', async () => {
    const { entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.createUserToken({
      id: '66666666-6666-4666-8666-666666666666',
      userId,
      purpose: 'email_verification',
      tokenHash: 'action-hash',
      expiresAt,
    });

    expect(result._unsafeUnwrap().tenantId).toBe(DefaultAuthTenantId);
  });

  it('finds usable refresh tokens using default tenant and clock', async () => {
    const entity = new AuthRefreshTokenEntity();
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(entity);
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.findUsableRefreshToken('hash');

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(
      AuthRefreshTokenEntity,
      expect.objectContaining({
        tokenHash: 'hash',
        tenantId: DefaultAuthTenantId,
      }),
    );
  });

  it('returns false when revoking a refresh token that is not usable', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.revokeRefreshToken('missing-hash');

    expect(result._unsafeUnwrap()).toBe(false);
    expect(flush).not.toHaveBeenCalled();
  });

  it('returns null when consuming a user action token that is not usable', async () => {
    const { flush, entityManager } = createEntityManagerMock();
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.consumeUserToken('missing-hash', 'email_verification');

    expect(result._unsafeUnwrap()).toBeNull();
    expect(flush).not.toHaveBeenCalled();
  });

  it('maps repository errors', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue(new Error('database unavailable'));
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.findUsableRefreshToken('hash', DefaultAuthTenantId);

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'database unavailable',
    });
  });

  it('maps non-error repository failures to a stable message', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockRejectedValue('connection dropped');
    const repository = new AuthTokenRepository(entityManager);

    const result = await repository.findUsableRefreshToken('hash', tenantId);

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Auth token repository failed.',
    });
  });
});
