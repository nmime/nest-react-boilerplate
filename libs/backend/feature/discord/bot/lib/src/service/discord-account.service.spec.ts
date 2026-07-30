// @requirements REQ-SOCIAL-COMMANDS-003
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordAccountExternalAuthInjectToken } from '../type/discord-account.port';
import { DiscordAccountService } from './discord-account.service';

const tenantId = '00000000-0000-0000-0000-000000000000';

describe('DiscordAccountService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('creates auth link URLs through the injected builder without OAuth credentials', async () => {
    const build = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://auth.example.test/discord/link?state=opaque',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    const service = new DiscordAccountService(undefined, { build });

    await expect(
      service.createLink({
        userId: '123456789012345678',
        guildId: '234567890123456789',
        tenantId,
        locale: 'en',
        returnUrl: 'https://app.example.test/return',
      }),
    ).resolves.toEqual({
      authorizationUrl: 'https://auth.example.test/discord/link?state=opaque',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(build).toHaveBeenCalledWith({
      userId: '123456789012345678',
      guildId: '234567890123456789',
      tenantId,
      locale: 'en',
      returnUrl: 'https://app.example.test/return',
    });
    expect(JSON.stringify(build.mock.calls)).not.toMatch(/access[_-]?token|refresh[_-]?token|client[_-]?secret/iu);
  });

  it('creates auth link URLs from the safe environment template', async () => {
    vi.stubEnv(
      'DISCORD_AUTH_LINK_URL_TEMPLATE',
      'https://auth.example.test/link?user={discordUserId}&guild={guildId}&tenant={tenantId}&locale={locale}',
    );
    const service = new DiscordAccountService();

    await expect(
      service.createLink({
        userId: 'user with spaces',
        guildId: 'guild/id',
        tenantId: 'tenant/id',
        locale: 'ru',
      }),
    ).resolves.toEqual({
      authorizationUrl:
        'https://auth.example.test/link?user=user%20with%20spaces&guild=guild%2Fid&tenant=tenant%2Fid&locale=ru',
    });
  });

  it('surfaces auth-service unavailability and reports status', async () => {
    const service = new DiscordAccountService({
      createDiscordAuthorizationRequest: vi.fn(() => {
        throw new Error('auth service unavailable');
      }),
      listProviderIdentities: vi.fn().mockResolvedValue([
        {
          provider: 'discord',
          providerSubject: '123456789012345678',
          displayName: null,
          username: 'tester',
        },
        {
          provider: 'github',
          providerSubject: '123456789012345678',
          displayName: 'Wrong',
          username: 'wrong',
        },
      ]),
    });

    await expect(
      service.createLink({
        userId: '123456789012345678',
        tenantId,
        locale: 'en',
      }),
    ).rejects.toThrow('auth service unavailable');
    await expect(service.status({ userId: '123456789012345678', tenantId })).resolves.toEqual({
      linked: true,
      displayName: 'tester',
    });
    await expect(service.status({ userId: '999999999999999999', tenantId })).resolves.toEqual({
      linked: false,
      displayName: null,
    });
  });

  it('unlinks a linked Discord identity through the external auth port', async () => {
    const unlinkProviderIdentity = vi.fn().mockResolvedValue({ unlinked: true });
    const service = new DiscordAccountService({
      createDiscordAuthorizationRequest: vi.fn(),
      listProviderIdentities: vi.fn().mockResolvedValue([
        {
          id: 'identity-1',
          provider: 'discord',
          providerSubject: '123456789012345678',
          displayName: null,
          username: 'tester',
        },
      ]),
      unlinkProviderIdentity,
    });

    await expect(service.unlink({ userId: '123456789012345678', tenantId })).resolves.toEqual({ unlinked: true });
    expect(unlinkProviderIdentity).toHaveBeenCalledWith('identity-1', {
      subject: '123456789012345678',
      tenantId,
    });
  });

  it('resolves the external auth port from its DI token and unlinks through it', async () => {
    const unlinkProviderIdentity = vi.fn().mockResolvedValue({ unlinked: true });
    const externalAuth = {
      createDiscordAuthorizationRequest: vi.fn(),
      listProviderIdentities: vi.fn().mockResolvedValue([
        {
          id: 'identity-1',
          provider: 'discord',
          providerSubject: '123456789012345678',
          displayName: null,
          username: 'tester',
        },
      ]),
      unlinkProviderIdentity,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordAccountService,
        {
          provide: DiscordAccountExternalAuthInjectToken,
          useValue: externalAuth,
        },
      ],
    }).compile();

    try {
      const service = moduleRef.get(DiscordAccountService);
      await expect(service.unlink({ userId: '123456789012345678', tenantId })).resolves.toEqual({ unlinked: true });
      await expect(service.status({ userId: '123456789012345678', tenantId })).resolves.toEqual({
        linked: true,
        displayName: 'tester',
      });
      expect(unlinkProviderIdentity).toHaveBeenCalledWith('identity-1', {
        subject: '123456789012345678',
        tenantId,
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('reports unlink as a no-op when no external auth is configured', async () => {
    const service = new DiscordAccountService();

    await expect(service.unlink({ userId: '123456789012345678', tenantId })).resolves.toEqual({ unlinked: false });
  });

  it('defaults to unlinked and requires a configured link builder', async () => {
    const service = new DiscordAccountService();

    await expect(service.status({ userId: '123456789012345678', tenantId })).resolves.toEqual({ linked: false });
    await expect(
      service.createLink({
        userId: '123456789012345678',
        tenantId,
        locale: 'en',
      }),
    ).rejects.toThrow('Discord account link URL builder is not configured');
  });

  it('falls back to the default tenant id and empty guild for the URL template', async () => {
    vi.stubEnv(
      'DISCORD_AUTH_LINK_URL_TEMPLATE',
      'https://auth.example.test/link?user={discordUserId}&guild={guildId}&tenant={tenantId}&locale={locale}',
    );
    const service = new DiscordAccountService();

    await expect(service.createLink({ userId: '123456789012345678', locale: 'en' })).resolves.toEqual({
      authorizationUrl: `https://auth.example.test/link?user=123456789012345678&guild=&tenant=${tenantId}&locale=en`,
    });
  });

  it('uses the default tenant id for status and unlink lookups', async () => {
    const listProviderIdentities = vi.fn().mockResolvedValue([
      {
        id: 'identity-1',
        provider: 'discord',
        providerSubject: '123456789012345678',
        displayName: null,
        username: 'tester',
      },
    ]);
    const unlinkProviderIdentity = vi.fn().mockResolvedValue({ unlinked: true });
    const service = new DiscordAccountService({
      createDiscordAuthorizationRequest: vi.fn(),
      listProviderIdentities,
      unlinkProviderIdentity,
    });

    await expect(service.status({ userId: '123456789012345678' })).resolves.toEqual({
      linked: true,
      displayName: 'tester',
    });
    expect(listProviderIdentities).toHaveBeenCalledWith('123456789012345678', tenantId);
    await expect(service.unlink({ userId: '123456789012345678' })).resolves.toEqual({ unlinked: true });
    expect(unlinkProviderIdentity).toHaveBeenCalledWith('identity-1', {
      subject: '123456789012345678',
      tenantId,
    });
  });
});
