// @requirements REQ-SOCIAL-SESSION-002
import type { FactoryProvider } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedisInjectToken } from '@app/backend-common-redis';
import { TelegramBotInstanceInjectToken } from '../const';
import type { TelegramBotInstance } from '../type';

const mocks = vi.hoisted(() => ({
  config: {
    token: '123:test',
    setupMenuButton: false,
    mode: 'webhook' as const,
    environment: 'test' as const,
    sessionTtlSeconds: 60,
    rateLimit: { timeFrameMs: 1_000, limit: 3 },
  },
  createTelegramBot: vi.fn(() => ({ id: 'bot' })),
  createTelegramSessionStorage: vi.fn(() => ({ id: 'session-storage' })),
  resolveTelegramBotConfig: vi.fn(),
  toRatelimiterRedisClient: vi.fn(() => ({ id: 'rate-limit-storage' })),
}));

vi.mock('./bot', () => ({
  createTelegramBot: mocks.createTelegramBot,
}));
vi.mock('./config', () => ({
  resolveTelegramBotConfig: mocks.resolveTelegramBotConfig,
}));
vi.mock('./session', () => ({
  createTelegramSessionStorage: mocks.createTelegramSessionStorage,
  toRatelimiterRedisClient: mocks.toRatelimiterRedisClient,
}));

import { TelegramBotModule } from './telegram-bot.module';

function botProvider(useRedis: boolean): FactoryProvider<TelegramBotInstance> {
  const module = TelegramBotModule.register({ useRedis });
  const provider = module.providers?.find(
    (candidate) => typeof candidate === 'object' && candidate.provide === TelegramBotInstanceInjectToken,
  );
  if (!provider || typeof provider !== 'object' || !('useFactory' in provider)) {
    throw new Error('Expected Telegram bot instance provider.');
  }
  expect(module.exports).toContain(TelegramBotInstanceInjectToken);
  expect(module.imports).toEqual([]);
  expect(module.exports).toEqual([TelegramBotInstanceInjectToken]);
  return provider as FactoryProvider<TelegramBotInstance>;
}

describe('TelegramBotModule', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the default polling/test composition independent from Redis', () => {
    mocks.resolveTelegramBotConfig.mockReturnValue(mocks.config);
    const provider = botProvider(false);

    expect(provider.inject).toEqual([]);
    (provider.useFactory as () => TelegramBotInstance)();

    expect(mocks.createTelegramSessionStorage).not.toHaveBeenCalled();
    expect(mocks.toRatelimiterRedisClient).not.toHaveBeenCalled();
    expect(mocks.createTelegramBot).toHaveBeenCalledWith(mocks.config, {});
  });

  it('defaults dynamic registration to no host imports', () => {
    expect(TelegramBotModule.register().imports).toEqual([]);
  });

  it('passes host imports through the dynamic module scope', () => {
    class HostRedisModule {}
    const module = TelegramBotModule.register({ imports: [HostRedisModule], useRedis: true });
    expect(module.imports).toEqual([HostRedisModule]);
  });

  it('injects one Redis client into webhook session and bot rate-limit storage', () => {
    mocks.resolveTelegramBotConfig.mockReturnValue(mocks.config);
    const provider = botProvider(true);
    const redis = { id: 'redis' };

    expect(provider.inject).toEqual([RedisInjectToken]);
    (provider.useFactory as (client: unknown) => TelegramBotInstance)(redis);

    expect(mocks.createTelegramSessionStorage).toHaveBeenCalledWith({
      redis,
      ttlSeconds: 60,
    });
    expect(mocks.toRatelimiterRedisClient).toHaveBeenCalledWith(redis);
    expect(mocks.createTelegramBot).toHaveBeenCalledWith(mocks.config, {
      sessionStorage: { id: 'session-storage' },
      rateLimitStorage: { id: 'rate-limit-storage' },
    });
  });
});
