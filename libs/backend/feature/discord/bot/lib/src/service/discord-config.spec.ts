// @requirements REQ-SOCIAL-COMMANDS-003
import { describe, expect, it } from 'vitest';
import { DefaultDiscordTenantId, DiscordBotConfig, resolveDiscordTenantId } from './discord-config';

const required = {
  DISCORD_APPLICATION_ID: '123456789012345678',
  DISCORD_PUBLIC_KEY: 'a'.repeat(64),
  DISCORD_CUSTOM_ID_SECRET: 'custom-id-secret',
};

describe('DiscordBotConfig', () => {
  it('builds a global-scope snapshot from the required environment', () => {
    const snapshot = new DiscordBotConfig().snapshot({ ...required });

    expect(snapshot).toMatchObject({
      applicationId: '123456789012345678',
      publicKey: 'a'.repeat(64),
      registrationScope: 'global',
      customIdSecret: 'custom-id-secret',
    });
    expect(snapshot.botToken).toBeUndefined();
    expect(snapshot.registrationGuildId).toBeUndefined();
  });

  it('selects guild scope from an explicit scope or a registration guild id', () => {
    expect(
      new DiscordBotConfig().snapshot({
        ...required,
        DISCORD_REGISTRATION_GUILD_ID: '234567890123456789',
      }).registrationScope,
    ).toBe('guild');
    expect(
      new DiscordBotConfig().snapshot({
        ...required,
        DISCORD_COMMAND_REGISTRATION_SCOPE: 'guild',
      }).registrationScope,
    ).toBe('guild');
  });

  it('falls back to AUTH_APP_BASE_URL and uses the dedicated custom-id secret', () => {
    const snapshot = new DiscordBotConfig().snapshot({
      DISCORD_APPLICATION_ID: '123456789012345678',
      DISCORD_PUBLIC_KEY: 'a'.repeat(64),
      AUTH_APP_BASE_URL: 'https://auth.example.test',
      DISCORD_CUSTOM_ID_SECRET: 'custom-id-secret',
      DISCORD_DEFAULT_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    });

    expect(snapshot.webAppBaseUrl).toBe('https://auth.example.test');
    expect(snapshot.customIdSecret).toBe('custom-id-secret');
    expect(snapshot.defaultTenantId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('throws when a required value is missing or blank', () => {
    expect(() =>
      new DiscordBotConfig().snapshot({
        DISCORD_PUBLIC_KEY: 'a'.repeat(64),
        DISCORD_CUSTOM_ID_SECRET: 's',
      }),
    ).toThrow('DISCORD_APPLICATION_ID is required for Discord bot runtime.');
    expect(() =>
      new DiscordBotConfig().snapshot({
        ...required,
        DISCORD_APPLICATION_ID: '   ',
      }),
    ).toThrow('DISCORD_APPLICATION_ID is required for Discord bot runtime.');
  });

  it('resolves the tenant id from interaction, environment, then default', () => {
    expect(resolveDiscordTenantId('tenant-from-interaction', {})).toBe('tenant-from-interaction');
    expect(
      resolveDiscordTenantId(null, {
        DISCORD_DEFAULT_TENANT_ID: 'tenant-from-env',
      }),
    ).toBe('tenant-from-env');
    expect(resolveDiscordTenantId(undefined, {})).toBe(DefaultDiscordTenantId);
  });
});
