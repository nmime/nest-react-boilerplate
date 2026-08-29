// @requirements REQ-SOCIAL-COMMANDS-003
import { describe, expect, it } from 'vitest';
import { TelegramEndpointRegistry } from './endpoint-registry';

describe('TelegramEndpointRegistry', () => {
  it('publishes the deterministic Telegram command and callback surface', () => {
    expect(TelegramEndpointRegistry).toEqual([
      { project: 'telegram-bot-api', kind: 'bot-command', method: 'N/A', path: 'telegram:command:/app' },
      { project: 'telegram-bot-api', kind: 'bot-command', method: 'N/A', path: 'telegram:command:/language' },
      { project: 'telegram-bot-api', kind: 'bot-command', method: 'N/A', path: 'telegram:command:/link' },
      { project: 'telegram-bot-api', kind: 'bot-command', method: 'N/A', path: 'telegram:command:/profile' },
      { project: 'telegram-bot-api', kind: 'bot-command', method: 'N/A', path: 'telegram:command:/start' },
      { project: 'telegram-bot-api', kind: 'bot-command', method: 'N/A', path: 'telegram:command:/support' },
      { project: 'telegram-bot-api', kind: 'bot-callback', method: 'N/A', path: 'telegram:menu:language:*' },
      {
        project: 'telegram-bot-api',
        kind: 'bot-callback',
        method: 'N/A',
        path: 'telegram:menu:link/instructions',
      },
      { project: 'telegram-bot-api', kind: 'bot-callback', method: 'N/A', path: 'telegram:menu:main' },
      { project: 'telegram-bot-api', kind: 'bot-callback', method: 'N/A', path: 'telegram:menu:profile' },
      { project: 'telegram-bot-api', kind: 'bot-callback', method: 'N/A', path: 'telegram:menu:settings' },
      {
        project: 'telegram-bot-api',
        kind: 'bot-callback',
        method: 'N/A',
        path: 'telegram:menu:support/contact',
      },
      {
        project: 'telegram-bot-api',
        kind: 'bot-callback',
        method: 'N/A',
        path: 'telegram:menu:unknown-callback',
      },
    ]);
    expect(new Set(TelegramEndpointRegistry.map(({ path }) => path)).size).toBe(TelegramEndpointRegistry.length);
  });
});
