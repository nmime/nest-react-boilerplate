import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { hashOpaqueToken, InMemoryAuthTokenStore, PostgresAuthTokenStore } from './auth-token-store';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';

describe('InMemoryAuthTokenStore', () => {
  it('issues and consumes a tenant-bound one-time user action token', async () => {
    const store = new InMemoryAuthTokenStore();
    const issued = await store.issueUserActionToken({
      tenantId: tenantA,
      userId: 'user-1',
      purpose: 'email_verification',
    });

    expect(issued.isOk()).toBe(true);
    if (issued.isErr()) {
      return;
    }

    expect(await store.consumeUserActionToken(issued.value.token, 'email_verification', tenantB)).toMatchObject({
      value: null,
    });
    expect(await store.consumeUserActionToken(issued.value.token, 'email_verification', tenantA)).toMatchObject({
      value: expect.objectContaining({ userId: 'user-1', consumedAt: expect.any(Date) }),
    });
    expect(await store.consumeUserActionToken(issued.value.token, 'email_verification', tenantA)).toMatchObject({
      value: null,
    });
  });

  it('does not expose any refresh-token authentication API', () => {
    const store = new InMemoryAuthTokenStore() as unknown as Record<string, unknown>;
    expect(store.issueRefreshToken).toBeUndefined();
    expect(store.rotateRefreshToken).toBeUndefined();
    expect(store.revokeRefreshToken).toBeUndefined();
    expect(store.findRefreshToken).toBeUndefined();
  });
});

describe('PostgresAuthTokenStore', () => {
  it('persists only a hash and consumes through the repository', async () => {
    const createUserToken = vi.fn((input) => okAsync(input));
    const consumeUserToken = vi.fn(() =>
      okAsync({
        id: 'token-1',
        tenantId: tenantA,
        userId: 'user-1',
        purpose: 'password_reset',
        tokenHash: 'stored-hash',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
      }),
    );
    const store = new PostgresAuthTokenStore({ createUserToken, consumeUserToken } as never);

    const issued = await store.issueUserActionToken({
      tenantId: tenantA,
      userId: 'user-1',
      purpose: 'password_reset',
    });
    expect(issued.isOk()).toBe(true);
    if (issued.isErr()) {
      return;
    }

    expect(createUserToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashOpaqueToken(issued.value.token) }),
    );
    expect(JSON.stringify(createUserToken.mock.calls)).not.toContain(issued.value.token);

    const consumed = await store.consumeUserActionToken(issued.value.token, 'password_reset', tenantA);
    expect(consumed.isOk()).toBe(true);
    expect(consumeUserToken).toHaveBeenCalledWith(hashOpaqueToken(issued.value.token), 'password_reset', tenantA);
  });

  it('maps repository failures without exposing repository details as a second auth path', async () => {
    const store = new PostgresAuthTokenStore({
      createUserToken: vi.fn(() => errAsync({ message: 'db offline' })),
    } as never);

    const result = await store.issueUserActionToken({
      tenantId: tenantA,
      userId: 'user-1',
      purpose: 'email_verification',
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({ code: 'token_store_error', message: 'db offline' });
  });
});
