// @requirements REQ-SOCIAL-INGRESS-001
import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRedisClient } from './in-memory-redis.client';
import { InboundCallbackReplayGuard, type InboundCallbackIngress } from './inbound-callback-replay.guard';
import type { RedisClientLike } from './type';

const originalNodeEnvironment = process.env['NODE_ENV'];

const skipIngress: InboundCallbackIngress = {
  namespace: ['social-ingress', 'demo'],
  processingTtlMs: 5_000,
  completedTtlMs: 60_000,
  onCompleted: 'skip',
  codes: {
    replayed: 'demo_replayed',
    unavailable: 'demo_replay_protection_unavailable',
    reservationLost: 'demo_replay_reservation_lost',
  },
};

const rejectIngress: InboundCallbackIngress = { ...skipIngress, onCompleted: 'reject' };

async function reserved(guard: InboundCallbackReplayGuard, ingress: InboundCallbackIngress, deliveryId: string) {
  const reservation = await guard.reserve(ingress, deliveryId);
  if (!reservation) {
    throw new Error('Expected an acquired inbound callback reservation.');
  }
  return reservation;
}

describe(InboundCallbackReplayGuard.name, () => {
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnvironment;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('admits a delivery id once while it is being processed', async () => {
    const guard = new InboundCallbackReplayGuard(new InMemoryRedisClient());

    const results = await Promise.allSettled([
      guard.reserve(skipIngress, '42'),
      guard.reserve(skipIngress, '42'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(UnauthorizedException),
    });
  });

  it('keys a reservation by its ingress namespace and delivery id', async () => {
    const guard = new InboundCallbackReplayGuard(new InMemoryRedisClient());

    await expect(guard.reserve(skipIngress, '42')).resolves.toMatchObject({
      key: 'social-ingress:demo:42',
      ownerValue: expect.stringMatching(/^processing:/u),
    });
  });

  it('cannot have its key boundaries shifted by a delivery id carrying the delimiter', async () => {
    const guard = new InboundCallbackReplayGuard(new InMemoryRedisClient());

    // Left verbatim, "demo:1" would address the same key as the ingress `demo` and delivery `1`,
    // so one provider's delivery could consume another's reservation.
    await expect(guard.reserve(skipIngress, 'demo:1')).resolves.toMatchObject({
      key: 'social-ingress:demo:demo_1',
    });
  });

  it('refuses an empty delivery id without touching the store', async () => {
    const set = vi.fn();
    const guard = new InboundCallbackReplayGuard({ set } as unknown as RedisClientLike);

    await expect(guard.reserve(skipIngress, '')).rejects.toThrow(/delivery id/u);
    expect(set).not.toHaveBeenCalled();
  });

  it('skips a redelivery of a completed callback when the ingress asks it to', async () => {
    const guard = new InboundCallbackReplayGuard(new InMemoryRedisClient());
    await guard.complete(await reserved(guard, skipIngress, '42'));

    await expect(guard.reserve(skipIngress, '42')).resolves.toBeNull();
  });

  it('rejects a redelivery of a completed callback when the ingress asks it to', async () => {
    const guard = new InboundCallbackReplayGuard(new InMemoryRedisClient());
    await guard.complete(await reserved(guard, rejectIngress, '42'));

    await expect(guard.reserve(rejectIngress, '42')).rejects.toMatchObject({ message: 'demo_replayed' });
  });

  it('lets a released reservation be retried', async () => {
    const guard = new InboundCallbackReplayGuard(new InMemoryRedisClient());
    const reservation = await reserved(guard, skipIngress, '42');

    await guard.release(reservation);

    await expect(guard.reserve(skipIngress, '42')).resolves.toMatchObject({ key: reservation.key });
  });

  it('releases a failed owner without deleting a replacement owner', async () => {
    const redis = new InMemoryRedisClient();
    const guard = new InboundCallbackReplayGuard(redis);
    const reservation = await reserved(guard, skipIngress, '42');

    await redis.set(reservation.key, 'processing:replacement');
    await guard.release(reservation);

    await expect(redis.get(reservation.key)).resolves.toBe('processing:replacement');
  });

  it('rejects completion after reservation ownership is lost', async () => {
    const redis = new InMemoryRedisClient();
    const guard = new InboundCallbackReplayGuard(redis);
    const reservation = await reserved(guard, skipIngress, '42');
    await redis.set(reservation.key, 'processing:replacement');

    await expect(guard.complete(reservation)).rejects.toMatchObject({
      message: 'demo_replay_reservation_lost',
    });
  });

  it('fails closed when a vanished reservation cannot be reacquired', async () => {
    const set = vi.fn().mockResolvedValue(null);
    const get = vi.fn().mockResolvedValue(null);
    const guard = new InboundCallbackReplayGuard({ set, get } as unknown as RedisClientLike);

    await expect(guard.reserve(skipIngress, '42')).rejects.toMatchObject({
      message: 'demo_replay_protection_unavailable',
    });
    expect(set).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails closed when owner-checked completion is unsupported', async () => {
    const guard = new InboundCallbackReplayGuard({} as RedisClientLike);

    await expect(
      guard.complete({ key: 'social-ingress:demo:42', ownerValue: 'processing:owner', ingress: skipIngress }),
    ).rejects.toMatchObject({ message: 'demo_replay_protection_unavailable' });
  });

  it('leaves cleanup to lease expiry when the store rejects release', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const deleteIfValue = vi.fn().mockRejectedValue(new Error('redis unavailable'));
    const guard = new InboundCallbackReplayGuard({ deleteIfValue } as unknown as RedisClientLike);

    await expect(
      guard.release({ key: 'social-ingress:demo:42', ownerValue: 'processing:owner', ingress: skipIngress }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Inbound callback replay reservation cleanup failed; the processing lease will expire.',
    );
  });

  it('fails closed within a bounded time when the store keeps reconnecting', async () => {
    vi.useFakeTimers();
    const guard = new InboundCallbackReplayGuard({
      set: vi.fn(() => new Promise(() => undefined)),
    } as unknown as RedisClientLike);
    const rejected = expect(guard.reserve(skipIngress, '42')).rejects.toBeInstanceOf(ServiceUnavailableException);

    await vi.advanceTimersByTimeAsync(1_001);

    await rejected;
  });

  it('refuses production startup without distributed replay storage configuration', () => {
    process.env['NODE_ENV'] = 'production';

    expect(() => new InboundCallbackReplayGuard(new InMemoryRedisClient())).toThrow(
      'Inbound callback replay protection requires Redis in production.',
    );
  });
});
