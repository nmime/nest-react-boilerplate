import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordAccountApplicationPort, DiscordAccountService } from '@app/backend-feature-discord-bot';
import { ExternalAuthService } from '@app/backend-feature-auth-main';
import { DiscordAppApiModule } from './discord-app-api.module';
import { DiscordExternalAuthAdapter } from './discord-external-auth.adapter';

const tenantId = '00000000-0000-0000-0000-000000000000';
const discordUserId = '123456789012345678';

/**
 * Boots the real application module and replaces only the auth feature's
 * ExternalAuthService with a spy, exercising the actual cross-module DI graph:
 * the account service (declared in DiscordBotModule) must resolve its external
 * auth port from the adapter the app binds in the bot module's scope.
 */
async function boot(externalAuth: Partial<ExternalAuthService>): Promise<{
  accounts: DiscordAccountService;
  externalAuth: Partial<ExternalAuthService>;
  close: () => Promise<void>;
}> {
  process.env.AUTH_PERSISTENCE = 'memory';
  process.env.OPENAPI_ENABLED = 'true';
  const moduleRef = await Test.createTestingModule({
    imports: [DiscordAppApiModule],
  })
    .overrideProvider(ExternalAuthService)
    .useValue(externalAuth)
    .compile();

  return {
    accounts: moduleRef.get(DiscordAccountService, { strict: false }),
    externalAuth,
    close: () => moduleRef.close(),
  };
}

describe('DiscordAppApiModule wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("binds the account service's external auth port to the ExternalAuthService adapter", async () => {
    const { accounts, close } = await boot({
      listProviderIdentities: vi.fn().mockResolvedValue([]),
    });

    try {
      // Same instance the DiscordBotModule resolves the application port to.
      expect(accounts).toBeInstanceOf(DiscordAccountService);
      const port = (accounts as unknown as { externalAuth: unknown }).externalAuth;
      expect(port).toBeInstanceOf(DiscordExternalAuthAdapter);
    } finally {
      await close();
    }
  });

  it('reports linked status from the wired ExternalAuthService identities', async () => {
    const listProviderIdentities = vi.fn().mockResolvedValue([
      {
        id: 'identity-1',
        provider: 'discord',
        providerSubject: discordUserId,
        displayName: 'Tester',
        username: 'tester',
      },
    ]);
    const { accounts, close } = await boot({ listProviderIdentities });

    try {
      await expect(accounts.status({ userId: discordUserId, tenantId })).resolves.toEqual({
        linked: true,
        displayName: 'Tester',
      });
      expect(listProviderIdentities).toHaveBeenCalledWith(discordUserId, tenantId);
    } finally {
      await close();
    }
  });

  it('unlinks through the wired ExternalAuthService with a fresh step-up authTime', async () => {
    const unlinkProviderIdentity = vi.fn().mockResolvedValue({ unlinked: true });
    const { accounts, close } = await boot({
      listProviderIdentities: vi.fn().mockResolvedValue([
        {
          id: 'identity-1',
          provider: 'discord',
          providerSubject: discordUserId,
          displayName: null,
          username: 'tester',
        },
      ]),
      unlinkProviderIdentity,
    });

    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      await expect(accounts.unlink({ userId: discordUserId, tenantId })).resolves.toEqual({ unlinked: true });

      expect(unlinkProviderIdentity).toHaveBeenCalledTimes(1);
      const [identityId, principal] = unlinkProviderIdentity.mock.calls[0] as [
        string,
        { subject: string; tenantId: string; authTime: number },
      ];
      expect(identityId).toBe('identity-1');
      expect(principal.subject).toBe(discordUserId);
      expect(principal.tenantId).toBe(tenantId);
      // The adapter supplies the verified interaction moment as the step-up
      // authTime the auth feature requires, so unlink is not a no-op.
      expect(principal.authTime).toBeGreaterThanOrEqual(nowSeconds - 1);
      expect(principal.authTime).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    } finally {
      await close();
    }
  });

  it('creates Discord authorization requests through the wired ExternalAuthService', async () => {
    const createDiscordAuthorizationRequest = vi.fn().mockReturnValue({
      authorizationUrl: 'https://discord.com/oauth2/authorize?state=abc',
      stateExpiresAt: '2026-07-03T00:00:00.000Z',
    });
    const { accounts, close } = await boot({
      createDiscordAuthorizationRequest,
    });

    try {
      const port = (accounts as unknown as { externalAuth: DiscordExternalAuthAdapter }).externalAuth;
      const withReturnUrl = port.createDiscordAuthorizationRequest({
        tenantId,
        intent: 'link',
        returnUrl: 'https://example.com/settings',
        principal: { subject: discordUserId, tenantId },
      });
      expect(withReturnUrl.authorizationUrl).toContain('discord.com');
      const withoutReturnUrl = port.createDiscordAuthorizationRequest({
        tenantId,
        intent: 'link',
        principal: { subject: discordUserId, tenantId },
      });
      expect(withoutReturnUrl.stateExpiresAt).toBe('2026-07-03T00:00:00.000Z');
      expect(createDiscordAuthorizationRequest).toHaveBeenCalledTimes(2);
      expect(createDiscordAuthorizationRequest).toHaveBeenLastCalledWith({
        tenantId,
        intent: 'link',
        returnUrl: undefined,
        principal: { subject: discordUserId, tenantId },
      });
    } finally {
      await close();
    }
  });

  it('exposes the account application port from the module graph', async () => {
    process.env.AUTH_PERSISTENCE = 'memory';
    process.env.OPENAPI_ENABLED = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordAppApiModule],
    })
      .overrideProvider(ExternalAuthService)
      .useValue({ listProviderIdentities: vi.fn().mockResolvedValue([]) })
      .compile();

    try {
      expect(moduleRef.get(DiscordAccountApplicationPort, { strict: false })).toBeInstanceOf(DiscordAccountService);
    } finally {
      await moduleRef.close();
    }
  });
});
