// @requirements REQ-SOCIAL-COMMANDS-003
import { describe, expect, it } from 'vitest';
import { DiscordEndpointRegistry } from './endpoint-registry';

describe('DiscordEndpointRegistry', () => {
  it('publishes a unique deterministic command and component surface', () => {
    expect(DiscordEndpointRegistry).toHaveLength(11);
    expect(DiscordEndpointRegistry[0]).toEqual({
      project: 'discord-app-api',
      kind: 'bot-command',
      method: 'N/A',
      path: 'discord:command:/account link',
    });
    expect(DiscordEndpointRegistry.at(-1)).toEqual({
      project: 'discord-app-api',
      kind: 'bot-modal',
      method: 'N/A',
      path: 'discord:modal:*',
    });
    expect(new Set(DiscordEndpointRegistry.map(({ path }) => path)).size).toBe(DiscordEndpointRegistry.length);
  });
});
