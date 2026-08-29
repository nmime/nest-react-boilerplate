// @requirements REQ-SOCIAL-INGRESS-001
import { describe, expect, it } from 'vitest';
import { TelegramRuntimeEndpointRegistry } from './endpoint-registry';

describe('TelegramRuntimeEndpointRegistry', () => {
  it('publishes the polling lifecycle endpoint', () => {
    expect(TelegramRuntimeEndpointRegistry).toEqual([
      {
        project: 'telegram-bot-api',
        kind: 'lifecycle',
        method: 'N/A',
        path: 'telegram:polling-runner',
      },
    ]);
  });
});
