// @requirements REQ-RUNTIME-MESSAGING-006
import { describe, expect, it, vi } from 'vitest';
import { RedisConfigService } from './config';
import { RedisMode } from './const';
import { RedisClientAdapter } from './redis-client.factory';
import { RedisLockUnavailableError } from './exception';
import { InMemoryRedisClient } from './in-memory-redis.client';
import { RedisRedlockService } from './redis-redlock.service';
import { RedisHealthIndicator } from './redis.health';
import { buildRateLimitKey, RedisRateLimitService } from './redis-rate-limit.service';
import type { RedisClientLike } from './type';

describe('RedisClientAdapter', () => {
  function nativeRedisClient(commands: string[][]) {
    return {
      isOpen: true,
      connect: vi.fn(() => Promise.resolve(undefined)),
      close: vi.fn(() => Promise.resolve(undefined)),
      destroy: vi.fn(() => Promise.resolve(undefined)),
      ping: vi.fn(() => Promise.resolve('PONG')),
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve('OK')),
      setEx: vi.fn(() => Promise.resolve('OK')),
      mGet: vi.fn(() => Promise.resolve([])),
      del: vi.fn(() => Promise.resolve(0)),
      incr: vi.fn(() => Promise.resolve(1)),
      expire: vi.fn(() => Promise.resolve(1)),
      hSet: vi.fn(() => Promise.resolve(1)),
      hGetAll: vi.fn(() => Promise.resolve({})),
      hDel: vi.fn(() => Promise.resolve(1)),
      sendCommand: vi.fn((command: string[]) => {
        commands.push(command);
        return Promise.resolve(1);
      }),
      on: vi.fn(),
    };
  }

  it('executes only fixed Redis Lua scripts for lock ownership operations', async () => {
    const commands: string[][] = [];
    const redis = new RedisClientAdapter(nativeRedisClient(commands), {
      keyPrefix: 'app:',
    });

    await expect(redis.deleteIfValue('lock', 'token')).resolves.toBe(true);
    await expect(redis.extendIfValue('lock', 'token', 1000)).resolves.toBe(true);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual([
      'EVAL',
      expect.stringContaining('redis.call("del", KEYS[1])'),
      '1',
      'app:lock',
      'token',
    ]);
    expect(commands[1]).toEqual([
      'EVAL',
      expect.stringContaining('redis.call("pexpire", KEYS[1], ARGV[2])'),
      '1',
      'app:lock',
      'token',
      '1000',
    ]);
  });

  it('increments a fixed window atomically via a single Lua script and derives reset from PTTL', async () => {
    const commands: string[][] = [];
    const client = {
      ...nativeRedisClient(commands),
      // The script returns {count, pttl}; PTTL (4200ms) is below the requested
      // window (5000ms), proving resetAt is taken from the key's real TTL.
      sendCommand: vi.fn((command: string[]) => {
        commands.push(command);
        return Promise.resolve([5, 4200]);
      }),
    };
    const redis = new RedisClientAdapter(client, { keyPrefix: 'app:' });

    const before = Date.now();
    const result = await redis.incrementWithWindow('rate', 5000);

    expect(result.count).toBe(5);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 4200);
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 4200);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.[0]).toBe('EVAL');
    expect(commands[0]?.[1]).toContain('redis.call("incr", KEYS[1])');
    expect(commands[0]?.[1]).toContain('redis.call("pttl", KEYS[1])');
    expect(commands[0]?.[1]).toContain('redis.call("pexpire", KEYS[1], ARGV[1])');
    expect(commands[0]?.slice(2)).toEqual(['1', 'app:rate', '5000']);
  });
});

describe('InMemoryRedisClient', () => {
  it('stores expiring values', async () => {
    const redis = new InMemoryRedisClient();
    await redis.setex('key', 60, 'value');
    await expect(redis.get('key')).resolves.toBe('value');
  });

  it('supports hashes', async () => {
    const redis = new InMemoryRedisClient();
    await redis.hset('hash', 'field', JSON.stringify({ ok: true }));
    await expect(redis.hgetall('hash')).resolves.toEqual({
      field: JSON.stringify({ ok: true }),
    });
  });

  it('preserves the existing TTL when incrementing', async () => {
    vi.useFakeTimers();
    try {
      const redis = new InMemoryRedisClient();
      await redis.set('counter', '1', 'PX', 1000);
      await expect(redis.incr('counter')).resolves.toBe(2);
      await expect(redis.get('counter')).resolves.toBe('2');

      vi.advanceTimersByTime(1500);
      await expect(redis.get('counter')).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('increments a fixed window atomically with a stable reset time', async () => {
    vi.useFakeTimers();
    try {
      const redis = new InMemoryRedisClient();
      const start = Date.now();

      await expect(redis.incrementWithWindow('rate', 1000)).resolves.toEqual({
        count: 1,
        resetAt: start + 1000,
      });

      vi.advanceTimersByTime(400);
      // A second hit within the window increments without sliding the reset
      // time forward (INCR must not refresh a live TTL).
      await expect(redis.incrementWithWindow('rate', 1000)).resolves.toEqual({
        count: 2,
        resetAt: start + 1000,
      });
      await expect(redis.get('rate')).resolves.toBe('2');

      // Once the window elapses the counter expires and a fresh window starts.
      vi.advanceTimersByTime(700);
      await expect(redis.get('rate')).resolves.toBeNull();
      await expect(redis.incrementWithWindow('rate', 1000)).resolves.toEqual({
        count: 1,
        resetAt: start + 2100,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports Redis lock primitives', async () => {
    const redis = new InMemoryRedisClient();

    await expect(redis.set('lock', 'one', 'PX', 1000, 'NX')).resolves.toBe('OK');
    await expect(redis.set('lock', 'two', 'PX', 1000, 'NX')).resolves.toBeNull();
    await expect(redis.get('lock')).resolves.toBe('one');

    await expect(redis.extendIfValue('lock', 'bad-token', 1000)).resolves.toBe(false);
    await expect(redis.extendIfValue('lock', 'one', 1000)).resolves.toBe(true);

    await expect(redis.deleteIfValue('lock', 'bad-token')).resolves.toBe(false);
    await expect(redis.deleteIfValue('lock', 'one')).resolves.toBe(true);
    await expect(redis.get('lock')).resolves.toBeNull();
  });
});

describe('RedisConfigService', () => {
  it('builds sentinel connection config', () => {
    const config = new RedisConfigService({
      mode: RedisMode.Sentinel,
      hosts: [
        {
          host: 'redis-a',
          port: 26379,
        },
      ],
      sentinelGroupIdentifier: 'mymaster',
      keyPrefix: 'app:',
      lazyConnect: false,
    });

    expect(config.connectionConfig).toEqual({
      mode: RedisMode.Sentinel,
      url: undefined,
      hosts: [
        {
          host: 'redis-a',
          port: 26379,
        },
      ],
      password: undefined,
      db: undefined,
      sentinelGroupIdentifier: 'mymaster',
      keyPrefix: 'app:',
      lazyConnect: false,
    });
  });
});

describe('RedisHealthIndicator', () => {
  it('checks Redis health with ping', async () => {
    const redis = new InMemoryRedisClient();
    const health = new RedisHealthIndicator(redis);

    await expect(health.check()).resolves.toEqual({
      name: 'redis',
      status: 'ok',
    });
  });

  it('redacts connection URLs and secret-like fields from Redis health errors', async () => {
    const unsafeMessage = [
      'connect',
      credentialUrl('redis', 'user', 'super-secret', 'redis:6379/0'),
      secretPair('password', 'super-secret'),
      secretPair('token', 'abc'),
    ].join(' ');
    const redis = Object.assign(new InMemoryRedisClient(), {
      ping: vi.fn(() => Promise.reject(new Error(unsafeMessage))),
    });
    const health = new RedisHealthIndicator(redis);

    await expect(health.check()).resolves.toEqual({
      name: 'redis',
      status: 'error',
      details: {
        message: [
          'connect',
          redactedUrl('redis', 'redis:6379/0'),
          redactedPair('password'),
          redactedPair('token'),
        ].join(' '),
        type: 'Error',
      },
    });
  });

  it('reports non-Error rejections without a type field', async () => {
    const redis = Object.assign(new InMemoryRedisClient(), {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately rejecting with a non-Error to exercise the non-Error handling path
      ping: vi.fn(() => Promise.reject('redis://user:pw@redis:6379 down')),
    });
    const health = new RedisHealthIndicator(redis);

    await expect(health.check()).resolves.toEqual({
      name: 'redis',
      status: 'error',
      details: { message: 'redis://[redacted]@redis:6379 down' },
    });
  });

  it('bounds a Redis health check whose client keeps reconnecting', async () => {
    vi.useFakeTimers();
    try {
      const redis = Object.assign(new InMemoryRedisClient(), {
        ping: vi.fn(() => new Promise<string>(() => undefined)),
      });
      const check = new RedisHealthIndicator(redis, 100).check();

      await vi.advanceTimersByTimeAsync(101);

      await expect(check).resolves.toMatchObject({
        name: 'redis',
        status: 'error',
        details: { message: 'Redis health check timed out.' },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function credentialUrl(protocol: string, username: string, password: string, hostAndPath: string): string {
  return `${protocol}://${username}:${password}@${hostAndPath}`;
}

function redactedUrl(protocol: string, hostAndPath: string): string {
  return `${protocol}://[redacted]@${hostAndPath}`;
}

function secretPair(key: string, value: string): string {
  return `${key}=${value}`;
}

function redactedPair(key: string): string {
  return `${key}=[redacted]`;
}

describe('RedisRedlockService', () => {
  it('acquires and releases a lock', async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);

    const lock = await redlock.acquire({
      resource: 'job:1',
      ttlMs: 1000,
    });

    expect(lock).toMatchObject({
      resource: 'job:1',
      key: 'redlock:job:1',
      ttlMs: 1000,
    });
    if (!lock) {
      throw new Error('Expected lock to be acquired.');
    }

    await expect(
      redlock.acquire({
        resource: 'job:1',
        ttlMs: 1000,
      }),
    ).resolves.toBeNull();

    await expect(redlock.release(lock)).resolves.toBe(true);
    await expect(
      redlock.acquire({
        resource: 'job:1',
        ttlMs: 1000,
      }),
    ).resolves.not.toBeNull();
  });

  it('extends a lock only when the token still owns it', async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);
    const lock = await redlock.acquire({
      resource: 'job:2',
      ttlMs: 1000,
    });
    if (!lock) {
      throw new Error('Expected lock to be acquired.');
    }

    const extended = await redlock.extend(lock, 2000);
    expect(extended).toMatchObject({
      resource: 'job:2',
      key: 'redlock:job:2',
      token: lock.token,
      ttlMs: 2000,
    });

    await redis.deleteIfValue(lock.key, lock.token);
    await expect(redlock.extend(lock, 2000)).resolves.toBeNull();
  });

  it('releases a lock after a using block', async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);

    await expect(
      redlock.using({
        resource: 'job:3',
        ttlMs: 1000,
        action: () => 'done',
      }),
    ).resolves.toBe('done');

    await expect(
      redlock.acquire({
        resource: 'job:3',
        ttlMs: 1000,
      }),
    ).resolves.not.toBeNull();
  });

  it('throws when using cannot acquire a lock', async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);
    const lock = await redlock.acquire({
      resource: 'job:4',
      ttlMs: 1000,
    });
    if (!lock) {
      throw new Error('Expected lock to be acquired.');
    }

    await expect(
      redlock.using({
        resource: 'job:4',
        ttlMs: 1000,
        action: () => 'never',
      }),
    ).rejects.toBeInstanceOf(RedisLockUnavailableError);

    await redlock.release(lock);
  });
});

describe('RedisRateLimitService', () => {
  it('builds tenant-aware shared rate-limit keys and counts hits', async () => {
    const redis = new InMemoryRedisClient();
    const limiter = new RedisRateLimitService(redis);
    const key = buildRateLimitKey({
      scope: 'auth',
      tenantId: '11111111-1111-4111-8111-111111111111',
      subject: 'User@Example.com',
      action: 'login',
    });

    expect(key).toBe('rate-limit:auth:11111111-1111-4111-8111-111111111111:user_example.com:login');
    await expect(limiter.hit({ key, windowSeconds: 60, limit: 1 })).resolves.toEqual({
      allowed: true,
      count: 1,
      remaining: 0,
    });
    await expect(limiter.hit({ key, windowSeconds: 60, limit: 1 })).resolves.toMatchObject({
      allowed: false,
      count: 2,
      remaining: 0,
    });
  });

  it('falls back to global/anonymous key parts when tenant and subject are absent', () => {
    expect(
      buildRateLimitKey({
        scope: 'auth',
        tenantId: null,
        subject: undefined,
        action: 'login',
      }),
    ).toBe('rate-limit:auth:global:anonymous:login');
  });

  it('counts hits atomically so the counter always carries a TTL', async () => {
    const incrementWithWindow = vi.fn(() => Promise.resolve({ count: 1, resetAt: Date.now() + 60000 }));
    const incr = vi.fn(() => Promise.resolve(1));
    const expire = vi.fn(() => Promise.resolve(1));
    const redis = { incrementWithWindow, incr, expire } as unknown as RedisClientLike;
    const limiter = new RedisRateLimitService(redis);

    await expect(limiter.hit({ key: 'rate-limit:auth:t:u:login', windowSeconds: 60, limit: 5 })).resolves.toEqual({
      allowed: true,
      count: 1,
      remaining: 4,
    });

    // The atomic INCR + PEXPIRE-if-no-TTL primitive is used instead of the
    // race-prone separate incr()/expire() pair that could leave a key with no
    // expiry (and thus permanently rate-limit a subject).
    expect(incrementWithWindow).toHaveBeenCalledWith('rate-limit:auth:t:u:login', 60000);
    expect(incr).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });

  it('escapes the ":" delimiter inside key parts so distinct tuples never collide', () => {
    const compositeSubject = buildRateLimitKey({
      scope: 'auth',
      tenantId: 't',
      subject: 'google:alice',
      action: 'login',
    });
    const compositeAction = buildRateLimitKey({
      scope: 'auth',
      tenantId: 't',
      subject: 'google',
      action: 'alice:login',
    });

    expect(compositeSubject).toBe('rate-limit:auth:t:google_alice:login');
    expect(compositeAction).toBe('rate-limit:auth:t:google:alice_login');
    expect(compositeSubject).not.toBe(compositeAction);
  });
});
