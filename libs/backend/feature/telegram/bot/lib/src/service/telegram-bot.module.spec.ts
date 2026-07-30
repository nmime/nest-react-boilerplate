// @requirements REQ-SOCIAL-COMMANDS-003
import { MODULE_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramBotInstanceInjectToken } from '../const';
import { TelegramBotModule } from './telegram-bot.module';

function hasConfigToken(value: unknown): value is { config: { token: string } } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'config' in value &&
    typeof value.config === 'object' &&
    value.config !== null &&
    'token' in value.config &&
    typeof value.config.token === 'string'
  );
}

describe('TelegramBotModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('declares and exports the bot instance provider', () => {
    const providersMetadata: unknown = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, TelegramBotModule);
    const providers = providersMetadata as Array<{
      provide?: unknown;
      useFactory?: () => unknown;
    }>;

    const provider = providers.find((candidate) => candidate.provide === TelegramBotInstanceInjectToken);
    expect(typeof provider?.useFactory).toBe('function');

    const exportsMetadata: unknown = Reflect.getMetadata(MODULE_METADATA.EXPORTS, TelegramBotModule);
    expect(Array.isArray(exportsMetadata)).toBe(true);
    expect(exportsMetadata).toContain(TelegramBotInstanceInjectToken);

    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123:test');
    vi.stubEnv('VITEST', 'true');
    const instance = provider?.useFactory?.();
    expect(hasConfigToken(instance)).toBe(true);
    if (!hasConfigToken(instance)) {
      throw new Error('Expected Telegram bot instance config.');
    }
    expect(instance.config.token).toBe('123:test');
  });
});
