import { describe, expect, it, vi } from 'vitest';
import { run } from '@grammyjs/runner';
import { TelegramPollingService } from './telegram-polling.service';
import type { TelegramBotInstance } from '@app/backend-feature-telegram-bot';

const stop = vi.fn(() => Promise.resolve(undefined));
const isRunning = vi.fn(() => true);

vi.mock('@grammyjs/runner', () => ({
  run: vi.fn(() => ({
    stop,
    isRunning,
    size: vi.fn(() => 0),
    task: vi.fn(() => undefined),
    start: vi.fn(),
  })),
}));

const testValue = <T>(value: unknown): T => value as T;

function instance(
  mode: 'webhook' | 'polling',
  environment: 'production' | 'development' | 'test' = 'development',
): TelegramBotInstance {
  return {
    config: {
      token: '123:test',
      webhookSecret: 'secret',
      mode,
      environment,
      sessionTtlSeconds: 60,
      rateLimit: { timeFrameMs: 1_000, limit: 10 },
    },
    menus: testValue<TelegramBotInstance['menus']>({}),
    bot: testValue<TelegramBotInstance['bot']>({}),
  };
}

describe('TelegramPollingService', () => {
  it('reports stopped before bootstrap', () => {
    const service = new TelegramPollingService(instance('polling', 'development'));

    expect(service.isRunning()).toBe(false);
  });

  it('guards against polling when webhook mode is configured', () => {
    const service = new TelegramPollingService(instance('webhook'));

    expect(() => {
      service.onApplicationBootstrap();
    }).toThrow(
      'Telegram polling runtime cannot start when TELEGRAM_BOT_MODE=webhook.',
    );
  });

  it('guards against polling in production', () => {
    const service = new TelegramPollingService(instance('polling', 'production'));

    expect(() => {
      service.onApplicationBootstrap();
    }).toThrow('Telegram polling runtime is disabled in production.');
  });

  it('starts runner for local polling mode', () => {
    vi.mocked(run).mockClear();
    const service = new TelegramPollingService(instance('polling', 'development'));

    service.onApplicationBootstrap();

    expect(service.isRunning()).toBe(true);
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        runner: { silent: false },
        sink: { concurrency: 10 },
      }),
    );
  });

  it('starts runner silently in test mode and stops it during shutdown', async () => {
    vi.mocked(run).mockClear();
    stop.mockClear();
    const service = new TelegramPollingService(instance('polling', 'test'));

    service.onApplicationBootstrap();
    await service.onApplicationShutdown();

    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runner: { silent: true } }),
    );
    expect(stop).toHaveBeenCalledTimes(1);
    expect(service.isRunning()).toBe(false);
  });

  it('allows shutdown before bootstrap', async () => {
    stop.mockClear();
    const service = new TelegramPollingService(
      instance('polling', 'development'),
    );

    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();

    expect(stop).not.toHaveBeenCalled();
  });
});
