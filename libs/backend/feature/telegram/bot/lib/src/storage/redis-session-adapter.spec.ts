import { describe, expect, it, vi } from 'vitest';
import type { RedisClientLike } from '@app/backend-common-redis';
import { RedisSessionStorage } from './redis-session-adapter';

function createRedisClient() {
  const client = {
    del: vi.fn(() => Promise.resolve(1)),
    get: vi.fn<RedisClientLike['get']>(() => Promise.resolve(null)),
    setex: vi.fn(() => Promise.resolve('OK')),
  };

  return client;
}

describe('RedisSessionStorage', () => {
  it('returns undefined for a missing session and parses a stored session', async () => {
    const redis = createRedisClient();
    const storage = new RedisSessionStorage<{ route: string }>({
      redisClient: redis as unknown as RedisClientLike,
      ttlSeconds: 300,
    });

    await expect(storage.read('42')).resolves.toBeUndefined();

    redis.get.mockResolvedValueOnce(JSON.stringify({ route: 'profile' }));
    await expect(storage.read('42')).resolves.toEqual({ route: 'profile' });
    expect(redis.get).toHaveBeenCalledWith('tg:session:42');
  });

  it('writes, replaces, and deletes sessions with a custom prefix', async () => {
    const redis = createRedisClient();
    const storage = new RedisSessionStorage<{ route: string }>({
      redisClient: redis as unknown as RedisClientLike,
      keyPrefix: 'tenant-a:telegram:',
      ttlSeconds: 120,
    });

    await storage.write('7', { route: 'main' });
    await storage.deleteAndWrite('7', { route: 'support' });
    await storage.delete('7');

    expect(redis.setex).toHaveBeenNthCalledWith(1, 'tenant-a:telegram:7', 120, JSON.stringify({ route: 'main' }));
    expect(redis.setex).toHaveBeenNthCalledWith(2, 'tenant-a:telegram:7', 120, JSON.stringify({ route: 'support' }));
    expect(redis.del).toHaveBeenCalledWith('tenant-a:telegram:7');
  });
});
