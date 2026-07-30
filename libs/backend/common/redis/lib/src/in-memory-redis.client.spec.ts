// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it, vi } from 'vitest';
import { InMemoryRedisClient } from './in-memory-redis.client';

describe('InMemoryRedisClient set conditions', () => {
  it('honours XX by requiring an existing key', async () => {
    const redis = new InMemoryRedisClient();

    await expect(redis.set('k', 'v', undefined, undefined, 'XX')).resolves.toBeNull();
    await redis.set('k', 'seed');
    await expect(redis.set('k', 'v', undefined, undefined, 'XX')).resolves.toBe('OK');
  });

  it('stores values without an expiry when no mode is supplied', async () => {
    const redis = new InMemoryRedisClient();
    await redis.set('k', 'v');
    await expect(redis.get('k')).resolves.toBe('v');
  });
});

describe('InMemoryRedisClient owner-checked replacement', () => {
  it('replaces and refreshes only the current owner value', async () => {
    vi.useFakeTimers();
    try {
      const redis = new InMemoryRedisClient();
      await redis.set('claim', 'owner-a');

      await expect(redis.replaceIfValue('claim', 'owner-b', 'completed', 1_000)).resolves.toBe(false);
      await expect(redis.replaceIfValue('claim', 'owner-a', 'completed', 1_000)).resolves.toBe(true);
      await expect(redis.get('claim')).resolves.toBe('completed');

      vi.advanceTimersByTime(1_001);
      await expect(redis.get('claim')).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('InMemoryRedisClient expire', () => {
  it('returns 0 for a missing key and expires hash keys', async () => {
    const redis = new InMemoryRedisClient();

    await expect(redis.expire('missing', 10)).resolves.toBe(0);

    await redis.hset('hash', 'field', 'value');
    await expect(redis.expire('hash', 10)).resolves.toBe(1);
  });

  it('evicts an expired hash on the next access', async () => {
    vi.useFakeTimers();
    try {
      const redis = new InMemoryRedisClient();
      await redis.hset('hash', 'field', 'value');
      await redis.expire('hash', 1);

      vi.advanceTimersByTime(1500);
      await expect(redis.hgetall('hash')).resolves.toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('InMemoryRedisClient pipeline', () => {
  it('executes every pipelined operation', async () => {
    const redis = new InMemoryRedisClient();
    await redis.hset('hash', 'field', 'value');
    await redis.set('doomed', 'seed');

    await redis
      .pipeline()
      .setex('string', 60, 'value')
      .hset('hash', 'other', 'value')
      .hdel('hash', 'field')
      .expire('string', 30)
      .del('doomed')
      .exec();

    await expect(redis.get('string')).resolves.toBe('value');
    await expect(redis.get('doomed')).resolves.toBeNull();
    await expect(redis.hgetall('hash')).resolves.toEqual({ other: 'value' });
  });
});

describe('InMemoryRedisClient hashes', () => {
  it('reports whether a field was newly created and drops shadowed value keys', async () => {
    const redis = new InMemoryRedisClient();

    await redis.set('k', 'value');
    await expect(redis.hset('k', 'field', 'v')).resolves.toBe(1);
    // Overwriting an existing field reports no new field.
    await expect(redis.hset('k', 'field', 'v2')).resolves.toBe(0);
    // Writing a hash removes any prior scalar value at the key.
    await expect(redis.get('k')).resolves.toBeNull();
  });

  it('counts deleted hash keys and reports missing hash fields', async () => {
    const redis = new InMemoryRedisClient();
    await redis.hset('h', 'f', 'v');

    await expect(redis.del('h')).resolves.toBe(1);
    await expect(redis.del('absent')).resolves.toBe(0);
    await expect(redis.hdel('missing', 'f')).resolves.toBe(0);
  });
});
