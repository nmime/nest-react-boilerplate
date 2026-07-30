// @requirements REQ-SOCIAL-INGRESS-001
import { BadRequestException, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisClient, type RedisClientLike } from '@app/backend-common-redis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordInteractionReplayProtection } from './discord-interaction-replay-protection';

const originalNodeEnvironment = process.env['NODE_ENV'];

describe(DiscordInteractionReplayProtection.name, () => {
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnvironment;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('atomically accepts an interaction id once under concurrent replay', async () => {
    const protection = new DiscordInteractionReplayProtection(new InMemoryRedisClient());

    const results = await Promise.allSettled([protection.reserve('123456789'), protection.reserve('123456789')]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(UnauthorizedException) });
  });

  it('keeps completed interactions replay-protected', async () => {
    const protection = new DiscordInteractionReplayProtection(new InMemoryRedisClient());
    const reservation = await protection.reserve('123456789');

    await protection.complete(reservation);

    await expect(protection.reserve('123456789')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('releases a failed owner without deleting a replacement owner', async () => {
    const redis = new InMemoryRedisClient();
    const protection = new DiscordInteractionReplayProtection(redis);
    const reservation = await protection.reserve('123456789');

    await redis.set(reservation.key, 'processing:replacement');
    await protection.release(reservation);

    await expect(redis.get(reservation.key)).resolves.toBe('processing:replacement');
  });

  it('allows a retry after a failed owner releases its reservation', async () => {
    const protection = new DiscordInteractionReplayProtection(new InMemoryRedisClient());
    const reservation = await protection.reserve('123456789');

    await protection.release(reservation);

    await expect(protection.reserve('123456789')).resolves.toMatchObject({
      key: reservation.key,
      ownerValue: expect.stringMatching(/^processing:/u),
    });
  });

  it('fails closed when a vanished reservation cannot be reacquired', async () => {
    const set = vi.fn().mockResolvedValue(null);
    const get = vi.fn().mockResolvedValue(null);
    const protection = new DiscordInteractionReplayProtection({ set, get } as unknown as RedisClientLike);

    await expect(protection.reserve('123456789')).rejects.toMatchObject({
      message: 'discord_replay_protection_unavailable',
    });
    expect(set).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails closed when owner-checked completion is unsupported', async () => {
    const protection = new DiscordInteractionReplayProtection({} as RedisClientLike);

    await expect(
      protection.complete({ key: 'social-ingress:discord:123456789', ownerValue: 'processing:owner' }),
    ).rejects.toMatchObject({ message: 'discord_replay_protection_unavailable' });
  });

  it('rejects completion after reservation ownership is lost', async () => {
    const redis = new InMemoryRedisClient();
    const protection = new DiscordInteractionReplayProtection(redis);
    const reservation = await protection.reserve('123456789');
    await redis.set(reservation.key, 'processing:replacement');

    await expect(protection.complete(reservation)).rejects.toMatchObject({
      message: 'discord_replay_reservation_lost',
    });
  });

  it('leaves cleanup to lease expiry when Redis rejects release', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const deleteIfValue = vi.fn().mockRejectedValue(new Error('redis unavailable'));
    const protection = new DiscordInteractionReplayProtection({ deleteIfValue } as unknown as RedisClientLike);

    await expect(
      protection.release({ key: 'social-ingress:discord:123456789', ownerValue: 'processing:owner' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Discord replay reservation cleanup failed; the processing lease will expire.');
  });

  it('rejects malformed interaction ids without touching replay storage', async () => {
    const set = vi.fn();
    const protection = new DiscordInteractionReplayProtection({ set } as unknown as RedisClientLike);

    await expect(protection.reserve('not-an-id')).rejects.toBeInstanceOf(BadRequestException);
    expect(set).not.toHaveBeenCalled();
  });

  it('fails closed within a bounded time when replay storage keeps reconnecting', async () => {
    vi.useFakeTimers();
    const protection = new DiscordInteractionReplayProtection({
      set: vi.fn(() => new Promise(() => undefined)),
    } as unknown as RedisClientLike);
    const reservation = protection.reserve('123456789');
    const rejected = expect(reservation).rejects.toBeInstanceOf(ServiceUnavailableException);

    await vi.advanceTimersByTimeAsync(1_001);

    await rejected;
  });

  it('refuses production startup without distributed replay storage configuration', () => {
    process.env['NODE_ENV'] = 'production';

    expect(() => new DiscordInteractionReplayProtection(new InMemoryRedisClient())).toThrow(
      'Discord replay protection requires Redis in production.',
    );
  });
});
