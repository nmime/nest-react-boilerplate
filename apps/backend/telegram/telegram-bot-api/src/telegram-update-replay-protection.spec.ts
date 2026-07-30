// @requirements REQ-SOCIAL-INGRESS-001
import { BadRequestException, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisClient, type RedisClientLike } from '@app/backend-common-redis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramUpdateReplayProtection } from './telegram-update-replay-protection';

const originalNodeEnvironment = process.env['NODE_ENV'];

describe(TelegramUpdateReplayProtection.name, () => {
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnvironment;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('atomically accepts an update id once while processing', async () => {
    const protection = new TelegramUpdateReplayProtection(new InMemoryRedisClient());

    const results = await Promise.allSettled([
      protection.reserve({ update_id: 42 }),
      protection.reserve({ update_id: 42 }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(UnauthorizedException) });
  });

  it('acknowledges a completed duplicate without dispatch ownership', async () => {
    const protection = new TelegramUpdateReplayProtection(new InMemoryRedisClient());
    const reservation = await protection.reserve({ update_id: 42 });
    expect(reservation).not.toBeNull();
    if (!reservation) {
      throw new Error('Expected an acquired Telegram update reservation.');
    }

    await protection.complete(reservation);

    await expect(protection.reserve({ update_id: 42 })).resolves.toBeNull();
  });

  it('releases a failed owner without deleting a replacement owner', async () => {
    const redis = new InMemoryRedisClient();
    const protection = new TelegramUpdateReplayProtection(redis);
    const reservation = await protection.reserve({ update_id: 42 });
    expect(reservation).not.toBeNull();
    if (!reservation) {
      throw new Error('Expected an acquired Telegram update reservation.');
    }

    await redis.set(reservation.key, 'processing:replacement');
    await protection.release(reservation);

    await expect(redis.get(reservation.key)).resolves.toBe('processing:replacement');
  });

  it('allows a provider retry after transient processing failure', async () => {
    const protection = new TelegramUpdateReplayProtection(new InMemoryRedisClient());
    const reservation = await protection.reserve({ update_id: 42 });
    expect(reservation).not.toBeNull();
    if (!reservation) {
      throw new Error('Expected an acquired Telegram update reservation.');
    }

    await protection.release(reservation);

    await expect(protection.reserve({ update_id: 42 })).resolves.toMatchObject({
      key: reservation.key,
      ownerValue: expect.stringMatching(/^processing:/u),
    });
  });

  it('fails closed when a vanished reservation cannot be reacquired', async () => {
    const set = vi.fn().mockResolvedValue(null);
    const get = vi.fn().mockResolvedValue(null);
    const protection = new TelegramUpdateReplayProtection({ set, get } as unknown as RedisClientLike);

    await expect(protection.reserve({ update_id: 42 })).rejects.toMatchObject({
      message: 'telegram_replay_protection_unavailable',
    });
    expect(set).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails closed when owner-checked completion is unsupported', async () => {
    const protection = new TelegramUpdateReplayProtection({} as RedisClientLike);

    await expect(
      protection.complete({ key: 'social-ingress:telegram:42', ownerValue: 'processing:owner' }),
    ).rejects.toMatchObject({ message: 'telegram_replay_protection_unavailable' });
  });

  it('rejects completion after reservation ownership is lost', async () => {
    const redis = new InMemoryRedisClient();
    const protection = new TelegramUpdateReplayProtection(redis);
    const reservation = await protection.reserve({ update_id: 42 });
    expect(reservation).not.toBeNull();
    if (!reservation) {
      throw new Error('Expected an acquired Telegram update reservation.');
    }
    await redis.set(reservation.key, 'processing:replacement');

    await expect(protection.complete(reservation)).rejects.toMatchObject({
      message: 'telegram_replay_reservation_lost',
    });
  });

  it('leaves cleanup to lease expiry when Redis rejects release', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const deleteIfValue = vi.fn().mockRejectedValue(new Error('redis unavailable'));
    const protection = new TelegramUpdateReplayProtection({ deleteIfValue } as unknown as RedisClientLike);

    await expect(
      protection.release({ key: 'social-ingress:telegram:42', ownerValue: 'processing:owner' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Telegram replay reservation cleanup failed; the processing lease will expire.');
  });

  it('rejects malformed update ids without touching replay storage', async () => {
    const set = vi.fn();
    const protection = new TelegramUpdateReplayProtection({ set } as unknown as RedisClientLike);

    await expect(protection.reserve({ update_id: '42' })).rejects.toBeInstanceOf(BadRequestException);
    expect(set).not.toHaveBeenCalled();
  });

  it('fails closed within a bounded time when replay storage keeps reconnecting', async () => {
    vi.useFakeTimers();
    const protection = new TelegramUpdateReplayProtection({
      set: vi.fn(() => new Promise(() => undefined)),
    } as unknown as RedisClientLike);
    const reservation = protection.reserve({ update_id: 42 });
    const rejected = expect(reservation).rejects.toBeInstanceOf(ServiceUnavailableException);

    await vi.advanceTimersByTimeAsync(1_001);

    await rejected;
  });

  it('refuses production startup without distributed replay storage configuration', () => {
    process.env['NODE_ENV'] = 'production';

    expect(() => new TelegramUpdateReplayProtection(new InMemoryRedisClient())).toThrow(
      'Telegram replay protection requires Redis in production.',
    );
  });
});
