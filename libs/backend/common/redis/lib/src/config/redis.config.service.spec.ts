// @requirements REQ-RUNTIME-STORAGE-007
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisMode } from '../const';
import { RedisConfigService } from './redis.config.service';
import { parseHostsConfig, toRedisMode } from './util';

type CustomHelpers = Parameters<typeof parseHostsConfig>[1];

function fakeHelpers(): CustomHelpers & { error: ReturnType<typeof vi.fn> } {
  return {
    error: vi.fn((code: string) => code),
  } as unknown as CustomHelpers & {
    error: ReturnType<typeof vi.fn>;
  };
}

describe('parseHostsConfig', () => {
  it('returns an empty list for an empty string', () => {
    expect(parseHostsConfig('', fakeHelpers())).toEqual([]);
  });

  it('parses comma-separated hosts, trimming blanks and defaulting the port', () => {
    expect(parseHostsConfig('redis-a:7000, redis-b ,', fakeHelpers())).toEqual([
      { host: 'redis-a', port: 7000 },
      { host: 'redis-b', port: 6379 },
    ]);
  });

  it('reports an invalid host when the name is missing', () => {
    const helpers = fakeHelpers();
    parseHostsConfig(':7000', helpers);
    expect(helpers.error).toHaveBeenCalledWith('any.invalid');
  });

  it('reports an invalid host when the port is not numeric', () => {
    const helpers = fakeHelpers();
    parseHostsConfig('redis-a:', helpers);
    expect(helpers.error).toHaveBeenCalledWith('any.invalid');
  });
});

describe('toRedisMode', () => {
  it('maps every supported mode string', () => {
    expect(toRedisMode(RedisMode.Single)).toBe(RedisMode.Single);
    expect(toRedisMode(RedisMode.Sentinel)).toBe(RedisMode.Sentinel);
    expect(toRedisMode(RedisMode.Cluster)).toBe(RedisMode.Cluster);
  });

  it('rejects an unknown mode', () => {
    expect(() => toRedisMode('weird' as never)).toThrow('Invalid Redis mode: weird');
  });
});

describe('RedisConfigService', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('REDIS_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('reads every field from the environment when no options override it', () => {
    process.env.REDIS_MODE = 'cluster';
    process.env.REDIS_URL = 'redis://redis-a:6379';
    process.env.REDIS_HOSTS = 'redis-a:7000,redis-b';
    process.env.REDIS_PASSWORD = 'secret';
    process.env.REDIS_DB = '2';
    process.env.REDIS_SENTINEL_GROUP_IDENTIFIER = 'mymaster';
    process.env.REDIS_KEY_PREFIX = 'app:';
    process.env.REDIS_LAZY_CONNECT = 'false';

    const config = new RedisConfigService({});

    expect(config.mode).toBe(RedisMode.Cluster);
    expect(config.url).toBe('redis://redis-a:6379');
    expect(config.hosts).toEqual([
      { host: 'redis-a', port: 7000 },
      { host: 'redis-b', port: 6379 },
    ]);
    expect(config.password).toBe('secret');
    expect(config.db).toBe(2);
    expect(config.sentinelGroupIdentifier).toBe('mymaster');
    expect(config.keyPrefix).toBe('app:');
    expect(config.lazyConnect).toBe(false);
    expect(config.connectionConfig).toMatchObject({
      mode: RedisMode.Cluster,
      url: 'redis://redis-a:6379',
    });
  });

  it('applies schema defaults and yields no connection config without a target', () => {
    const config = new RedisConfigService({});

    expect(config.mode).toBe(RedisMode.Single);
    expect(config.url).toBeUndefined();
    expect(config.hosts).toEqual([]);
    expect(config.password).toBeUndefined();
    expect(config.db).toBeUndefined();
    expect(config.sentinelGroupIdentifier).toBeUndefined();
    expect(config.keyPrefix).toBeUndefined();
    expect(config.lazyConnect).toBe(true);
    expect(config.connectionConfig).toBeUndefined();
  });

  it('prefers explicit options over the environment for every field', () => {
    process.env.REDIS_MODE = 'cluster';
    process.env.REDIS_URL = 'redis://env';

    const config = new RedisConfigService({
      mode: RedisMode.Single,
      url: 'redis://opt',
      hosts: [{ host: 'opt-host', port: 6380 }],
      password: 'opt-pass',
      db: 5,
      sentinelGroupIdentifier: 'opt-group',
      keyPrefix: 'opt:',
      lazyConnect: false,
    });

    expect(config.mode).toBe(RedisMode.Single);
    expect(config.url).toBe('redis://opt');
    expect(config.hosts).toEqual([{ host: 'opt-host', port: 6380 }]);
    expect(config.password).toBe('opt-pass');
    expect(config.db).toBe(5);
    expect(config.sentinelGroupIdentifier).toBe('opt-group');
    expect(config.keyPrefix).toBe('opt:');
    expect(config.lazyConnect).toBe(false);
    expect(config.connectionConfig).toEqual({
      mode: RedisMode.Single,
      url: 'redis://opt',
      hosts: [{ host: 'opt-host', port: 6380 }],
      password: 'opt-pass',
      db: 5,
      sentinelGroupIdentifier: 'opt-group',
      keyPrefix: 'opt:',
      lazyConnect: false,
    });
  });

  it('requires a sentinel group identifier before building sentinel connection config', () => {
    const config = new RedisConfigService({
      mode: RedisMode.Sentinel,
      hosts: [{ host: 'sentinel-a', port: 26379 }],
    });

    expect(() => config.connectionConfig).toThrow(
      'REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.',
    );
  });
});
