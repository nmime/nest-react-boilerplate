import { describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { hashOpaqueToken, InMemoryAuthTokenStore, PostgresAuthTokenStore } from './auth-token-store';
import { createIssuedRefreshToken, createIssuedUserActionToken } from './factory/auth-token.factory';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

describe('InMemoryAuthTokenStore', () => {
  it('rotates and revokes refresh tokens per tenant', async () => {
    const store = new InMemoryAuthTokenStore();
    const issued = await store.issueRefreshToken({
      tenantId: tenantA,
      userId: 'user-1',
    });
    expect(issued.isOk()).toBe(true);
    if (issued.isErr()) {
      throw new Error(issued.error.message);
    }

    await expect(store.findRefreshToken(issued.value.token, tenantB)).resolves.toMatchObject({
      value: null,
    });

    const rotated = await store.rotateRefreshToken(issued.value.token, tenantA);
    expect(rotated.isOk()).toBe(true);
    if (rotated.isErr() || !rotated.value) {
      throw new Error('expected refresh rotation');
    }
    expect(rotated.value.token).not.toBe(issued.value.token);

    await expect(store.rotateRefreshToken(issued.value.token, tenantA)).resolves.toMatchObject({
      value: null,
    });
    await expect(store.revokeRefreshToken(rotated.value.token, tenantA)).resolves.toMatchObject({
      value: true,
    });
    await expect(store.revokeRefreshToken('missing-token', tenantA)).resolves.toMatchObject({
      value: false,
    });
    await expect(store.findRefreshToken(rotated.value.token, tenantA)).resolves.toMatchObject({
      value: null,
    });
  });

  it('consumes email verification and password reset tokens once', async () => {
    const store = new InMemoryAuthTokenStore();
    const issued = await store.issueUserActionToken({
      tenantId: tenantA,
      userId: 'user-1',
      purpose: 'password_reset',
    });
    expect(issued.isOk()).toBe(true);
    if (issued.isErr()) {
      throw new Error(issued.error.message);
    }

    await expect(
      store.consumeUserActionToken(issued.value.token, 'email_verification', tenantA),
    ).resolves.toMatchObject({ value: null });
    await expect(store.consumeUserActionToken(issued.value.token, 'password_reset', tenantB)).resolves.toMatchObject({
      value: null,
    });
    await expect(store.consumeUserActionToken('missing-token', 'password_reset', tenantA)).resolves.toMatchObject({
      value: null,
    });
    const consumed = await store.consumeUserActionToken(issued.value.token, 'password_reset', tenantA);
    expect(consumed.isOk()).toBe(true);
    if (consumed.isErr() || !consumed.value) {
      throw new Error('expected consumable password reset token');
    }
    expect(consumed.value.userId).toBe('user-1');
    await expect(store.consumeUserActionToken(issued.value.token, 'password_reset', tenantA)).resolves.toMatchObject({
      value: null,
    });
  });
});

describe('auth token factories', () => {
  it('defaults missing tenants and accepts explicit families and TTLs', () => {
    const refresh = createIssuedRefreshToken({
      tenantId: '',
      userId: 'user-1',
      familyId: 'family-1',
      ttlSeconds: 1,
    });
    const action = createIssuedUserActionToken({
      tenantId: '',
      userId: 'user-1',
      purpose: 'email_verification',
      ttlSeconds: 1,
    });

    expect(refresh).toMatchObject({
      familyId: 'family-1',
      tenantId: DefaultAuthTenantId,
    });
    expect(action).toMatchObject({
      purpose: 'email_verification',
      tenantId: DefaultAuthTenantId,
    });
  });
});

describe('PostgresAuthTokenStore', () => {
  it('persists only token hashes for refresh and user action tokens', async () => {
    const repository = {
      createRefreshToken: vi.fn(() => okAsync({})),
      createUserToken: vi.fn(() => okAsync({})),
    };
    const store = new PostgresAuthTokenStore(repository as never);

    const refresh = await store.issueRefreshToken({
      tenantId: tenantA,
      userId: 'user-1',
    });
    const action = await store.issueUserActionToken({
      tenantId: tenantA,
      userId: 'user-1',
      purpose: 'password_reset',
    });

    expect(refresh.isOk()).toBe(true);
    expect(action.isOk()).toBe(true);
    if (refresh.isErr() || action.isErr()) {
      throw new Error('expected issued postgres tokens');
    }

    expect(repository.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: tenantA,
        userId: 'user-1',
        tokenHash: hashOpaqueToken(refresh.value.token),
      }),
    );
    expect(repository.createUserToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: tenantA,
        userId: 'user-1',
        purpose: 'password_reset',
        tokenHash: hashOpaqueToken(action.value.token),
      }),
    );
    expect(JSON.stringify(repository.createRefreshToken.mock.calls)).not.toContain(refresh.value.token);
    expect(JSON.stringify(repository.createUserToken.mock.calls)).not.toContain(action.value.token);
  });

  it('rotates, revokes, finds, and consumes tokens by hash and maps entities back', async () => {
    const refreshEntity = {
      id: 'rotated-id',
      tenantId: tenantA,
      userId: 'user-1',
      tokenHash: 'rotated-hash',
      familyId: 'family-1',
      parentTokenId: 'parent-id',
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      revokedAt: null,
      replacedByTokenId: null,
    };
    const userTokenEntity = {
      id: 'action-id',
      tenantId: tenantA,
      userId: 'user-1',
      purpose: 'password_reset' as const,
      tokenHash: 'action-hash',
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
      consumedAt: null,
    };
    const repository = {
      rotateRefreshToken: vi.fn(() => okAsync(refreshEntity)),
      revokeRefreshToken: vi.fn(() => okAsync(true)),
      findUsableRefreshToken: vi.fn(() => okAsync(refreshEntity)),
      consumeUserToken: vi.fn(() => okAsync(userTokenEntity)),
    };
    const store = new PostgresAuthTokenStore(repository as never);

    const rotated = await store.rotateRefreshToken('old-token', tenantA);
    expect(rotated._unsafeUnwrap()).toMatchObject({
      id: 'rotated-id',
      userId: 'user-1',
      familyId: 'family-1',
    });
    // The new opaque token is issued client-side and never derived from the hash.
    expect(rotated._unsafeUnwrap()?.token).not.toBe('rotated-hash');
    expect(repository.rotateRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: hashOpaqueToken('old-token'),
        tenantId: tenantA,
      }),
    );

    expect((await store.revokeRefreshToken('old-token', tenantA))._unsafeUnwrap()).toBe(true);
    expect(repository.revokeRefreshToken).toHaveBeenCalledWith(hashOpaqueToken('old-token'), tenantA);

    expect((await store.findRefreshToken('old-token', tenantA))._unsafeUnwrap()).toMatchObject({
      id: 'rotated-id',
      tokenHash: 'rotated-hash',
    });
    expect(
      (await store.consumeUserActionToken('action-token', 'password_reset', tenantA))._unsafeUnwrap(),
    ).toMatchObject({ id: 'action-id', purpose: 'password_reset' });
  });

  it('returns null when rotation, lookup, or consumption find nothing', async () => {
    const repository = {
      rotateRefreshToken: vi.fn(() => okAsync(null)),
      findUsableRefreshToken: vi.fn(() => okAsync(null)),
      consumeUserToken: vi.fn(() => okAsync(null)),
    };
    const store = new PostgresAuthTokenStore(repository as never);

    expect((await store.rotateRefreshToken('t'))._unsafeUnwrap()).toBeNull();
    expect((await store.findRefreshToken('t'))._unsafeUnwrap()).toBeNull();
    expect((await store.consumeUserActionToken('t', 'email_verification'))._unsafeUnwrap()).toBeNull();
  });

  it('maps repository failures to token store errors with a stable fallback message', async () => {
    const failingRotate = {
      rotateRefreshToken: vi.fn(() => errAsync({ message: 'db offline' })),
    };
    const failingRevoke = {
      revokeRefreshToken: vi.fn(() => errAsync({})),
    };
    const withMessage = new PostgresAuthTokenStore(failingRotate as never);
    const withoutMessage = new PostgresAuthTokenStore(failingRevoke as never);

    expect((await withMessage.rotateRefreshToken('t'))._unsafeUnwrapErr()).toEqual({
      code: 'token_store_error',
      message: 'db offline',
    });
    expect((await withoutMessage.revokeRefreshToken('t'))._unsafeUnwrapErr()).toEqual({
      code: 'token_store_error',
      message: 'Auth token store failed.',
    });
  });
});
