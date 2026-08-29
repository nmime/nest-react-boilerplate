// @requirements REQ-AUTH-IDENTITY-005
import { describe, expect, it, vi } from 'vitest';
import type { RedisClientLike } from '@app/backend-common-redis';
import { ExternalAuthIntent } from '@app/backend-feature-auth-shared';
import type { StoredDiscordState } from '../application/type/external-auth-internal.type';
import { InMemoryDiscordOauthStateStore } from './in-memory-discord-oauth-state.store';
import { RedisDiscordOauthStateStore } from './redis-discord-oauth-state.store';

const state = (stateHash: string, expiresAt = new Date(Date.now() + 60_000)): StoredDiscordState => ({
  tenantId: 'tenant-id',
  stateHash,
  codeVerifier: 'verifier',
  intent: ExternalAuthIntent.Login,
  expiresAt,
});

describe('Discord OAuth state stores', () => {
  it('consumes in-memory state once and evicts the oldest entry at the configured limit', async () => {
    const store = new InMemoryDiscordOauthStateStore(() => 2);
    await store.store(state('one'), 60);
    await store.store(state('two'), 60);
    await store.store(state('three'), 60);

    await expect(store.consume('one')).resolves.toBeNull();
    await expect(store.consume('three')).resolves.toMatchObject({ codeVerifier: 'verifier' });
    await expect(store.consume('three')).resolves.toBeNull();
  });

  it('rejects expired in-memory state', async () => {
    const store = new InMemoryDiscordOauthStateStore(() => 2);
    await store.store(state('expired', new Date(Date.now() - 1)), 60);
    await expect(store.consume('expired')).resolves.toBeNull();
  });

  it('stores Redis state with TTL and atomically consumes the serialized value', async () => {
    const serialized = JSON.stringify({ ...state('shared'), expiresAt: state('shared').expiresAt.toISOString() });
    const redis = {
      setex: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(serialized),
      deleteIfValue: vi.fn().mockResolvedValue(true),
    } as unknown as RedisClientLike;
    const store = new RedisDiscordOauthStateStore(redis);

    await store.store(state('shared'), 300);
    await expect(store.consume('shared')).resolves.toMatchObject({ stateHash: 'shared', expiresAt: expect.any(Date) });
    expect(redis.setex).toHaveBeenCalledWith('auth:discord-oauth-state:shared', 300, expect.any(String));
    expect(redis.deleteIfValue).toHaveBeenCalledWith('auth:discord-oauth-state:shared', serialized);
  });

  it('fails closed when Redis state is absent, already consumed, malformed, or expired', async () => {
    const redis = {
      setex: vi.fn(),
      get: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('{}')
        .mockResolvedValueOnce('{bad')
        .mockResolvedValueOnce(JSON.stringify({ ...state('expired'), expiresAt: new Date(0).toISOString() })),
      deleteIfValue: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
    } as unknown as RedisClientLike;
    const store = new RedisDiscordOauthStateStore(redis);

    await expect(store.consume('absent')).resolves.toBeNull();
    await expect(store.consume('raced')).resolves.toBeNull();
    await expect(store.consume('malformed')).resolves.toBeNull();
    await expect(store.consume('expired')).resolves.toBeNull();
  });
});
