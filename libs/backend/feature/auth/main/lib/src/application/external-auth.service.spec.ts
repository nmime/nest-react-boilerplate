import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import {
  AuthenticatedTheme,
  AuthProvider,
  AuthProviderChannel,
  DefaultAuthTenantId,
  ExternalAuthIntent,
  validateBearerAuthorization,
} from '@app/backend-feature-auth-shared';
import { AuthService } from './auth.service';
import { InMemoryAuthUserStore } from '../infrastructure/auth-user-store';
import { ExternalAuthService } from './external-auth.service';
import { InMemorySocialAuthStore, type PersistProviderTokenInput } from '../infrastructure/social-auth-store';

const tmaMocks = vi.hoisted(() => ({
  parse: vi.fn(),
  validate: vi.fn(),
}));

const arcticMocks = vi.hoisted(() => ({
  authorizationUrl: vi.fn(),
  generateCodeVerifier: vi.fn(),
  generateState: vi.fn(),
  validateAuthorizationCode: vi.fn(),
}));

vi.mock('@tma.js/init-data-node', () => ({
  parse: tmaMocks.parse,
  validate: tmaMocks.validate,
}));

vi.mock('arctic', () => ({
  Discord: vi.fn().mockImplementation(function DiscordMock() {
    return {
      createAuthorizationURL: arcticMocks.authorizationUrl,
      validateAuthorizationCode: arcticMocks.validateAuthorizationCode,
    };
  }),
  generateCodeVerifier: arcticMocks.generateCodeVerifier,
  generateState: arcticMocks.generateState,
}));

const testJwtSecretValue = 'testJwtSecretValue_at_least_32_chars';
const botToken = '123456:telegram-bot-token';
const discordAccessValue = ['discord', 'access', 'value'].join('-');
const discordRefreshValue = ['discord', 'refresh', 'value'].join('-');

const authUserRecord = (
  overrides: Partial<{
    displayName: string | null;
    email: string | null;
    id: string;
    lastLoginAt: Date | null;
    locale: null | 'en' | 'ru';
    passwordHash: string;
    permissions: string[];
    roles: string[];
    status: 'active' | 'disabled' | 'invited';
    tenantId: string;
    theme: AuthenticatedTheme;
  }> = {},
) => ({
  id: 'external-user-id',
  tenantId: DefaultAuthTenantId,
  email: null,
  displayName: null,
  passwordHash: 'hash',
  roles: ['user'],
  permissions: ['profile:read'],
  locale: null,
  theme: AuthenticatedTheme.System,
  status: 'active' as const,
  lastLoginAt: null,
  ...overrides,
});

function createService(social = new InMemorySocialAuthStore()) {
  const users = new InMemoryAuthUserStore();
  const auth = new AuthService(users, undefined, social);
  const service = new ExternalAuthService(auth, users, social);
  return { auth, service, social, users };
}

function createServiceWithStores(users: unknown, social: unknown) {
  const auth = new AuthService(users as never, undefined, social as never);
  const service = new ExternalAuthService(auth, users as never, social as never);
  return { auth, service };
}

function discordTokens(
  input: {
    accessValue?: string;
    refreshValue?: string | null;
    scopes?: string[];
    expiresAt?: Date;
  } = {},
) {
  return {
    accessToken: vi.fn(() => input.accessValue ?? discordAccessValue),
    accessTokenExpiresAt: vi.fn(() => input.expiresAt ?? new Date('2026-06-14T12:10:00.000Z')),
    hasRefreshToken: vi.fn(() => input.refreshValue !== null),
    hasScopes: vi.fn(() => Boolean(input.scopes)),
    refreshToken: vi.fn(() => input.refreshValue ?? discordRefreshValue),
    scopes: vi.fn(() => input.scopes ?? []),
  };
}

class CapturingSocialAuthStore extends InMemorySocialAuthStore {
  readonly persistedProviderTokens: PersistProviderTokenInput[] = [];
  readonly createdLinkTokenHashes: string[] = [];
  revokedProviderTokenCalls = 0;

  override createLinkToken(input: Parameters<InMemorySocialAuthStore['createLinkToken']>[0]) {
    this.createdLinkTokenHashes.push(input.tokenHash);
    return super.createLinkToken(input);
  }

  override persistProviderToken(input: PersistProviderTokenInput) {
    this.persistedProviderTokens.push(input);
    return super.persistProviderToken(input);
  }

  override revokeProviderTokens(externalIdentityId: string, tenantId: string) {
    this.revokedProviderTokenCalls += 1;
    return super.revokeProviderTokens(externalIdentityId, tenantId);
  }
}

describe('ExternalAuthService', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.env.AUTH_JWT_SECRET = testJwtSecretValue;
    process.env.TELEGRAM_BOT_TOKEN = botToken;
    process.env.DISCORD_CLIENT_ID = 'discord-client-id';
    process.env.DISCORD_CLIENT_SECRET = 'discord-client-secret';
    process.env.DISCORD_REDIRECT_URI = 'https://auth.example.test/callback';
    delete process.env.EXTERNAL_AUTH_AUTO_PROVISION;
    delete process.env.AUTH_TELEGRAM_ENABLED;
    delete process.env.AUTH_DISCORD_ENABLED;
    delete process.env.AUTH_ALLOWED_RETURN_URLS;
    delete process.env.TELEGRAM_TMA_MAX_AGE_SECONDS;
    delete process.env.AUTH_LINK_TOKEN_TTL_SECONDS;
    delete process.env.DISCORD_OAUTH_STATE_TTL_SECONDS;
    delete process.env.DISCORD_OAUTH_STATE_MAX_ENTRIES;
    delete process.env.DISCORD_TOKEN_STORAGE_ENABLED;
    delete process.env.DISCORD_OAUTH_SCOPES;
    tmaMocks.parse.mockReset();
    tmaMocks.validate.mockReset();
    arcticMocks.authorizationUrl.mockReset();
    arcticMocks.authorizationUrl.mockReturnValue(new URL('https://discord.example.test/oauth?state=discord-state'));
    arcticMocks.generateCodeVerifier.mockReset();
    arcticMocks.generateCodeVerifier.mockReturnValue('discord-code-verifier');
    arcticMocks.generateState.mockReset();
    arcticMocks.generateState.mockReturnValue('discord-state');
    arcticMocks.validateAuthorizationCode.mockReset();
    arcticMocks.validateAuthorizationCode.mockResolvedValue(discordTokens());
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              avatar: 'avatar-hash',
              email: 'discord@example.com',
              global_name: 'Discord User',
              id: 'discord-subject',
              username: 'discord-user',
              verified: true,
            }),
        }),
      ),
    );
  });

  it('projects a Better Auth Telegram OIDC profile and emits external JWT claims', async () => {
    const { service } = createService();

    const result = await service.telegramOidcSession({
      profile: {
        avatarUrl: 'https://cdn.example.test/ada.png',
        displayName: 'Ada',
        providerSubject: '42',
      },
    });

    expect(result.status).toBe('authenticated');
    expect(result.session?.user.email).toBeNull();
    expect(result.identity).toMatchObject({
      provider: 'telegram',
      providerSubject: '42',
      channel: 'telegram_oidc',
    });
    expect(
      validateBearerAuthorization(`Bearer ${result.session?.accessToken}`, {
        AUTH_JWT_SECRET: testJwtSecretValue,
      }),
    ).toMatchObject({
      amr: ['telegram'],
      authProvider: 'telegram',
      authChannel: 'telegram_oidc',
      externalIdentityId: result.identity?.id,
    });
  });

  it('returns needs-link for a verified Telegram OIDC profile when auto provision is disabled', async () => {
    const { service } = createService();

    process.env.EXTERNAL_AUTH_AUTO_PROVISION = 'false';
    await expect(
      service.telegramOidcSession({
        profile: { avatarUrl: null, displayName: null, providerSubject: '43' },
      }),
    ).resolves.toMatchObject({ status: 'needs_link', code: 'needs_link' });
  });

  it('creates hashed one-time link tokens and links a Telegram identity', async () => {
    const { auth, service } = createService();
    const passwordSession = await auth.register({
      email: 'link@example.com',
      password: 'password123',
    });

    const linkToken = await service.createLinkToken({
      userId: passwordSession.user.id,
      provider: AuthProvider.Telegram,
    });
    expect(linkToken.token).toHaveLength(43);
    process.env.AUTH_ALLOWED_RETURN_URLS = 'https://app.example.test';
    await expect(
      service.createLinkToken({
        userId: passwordSession.user.id,
        provider: AuthProvider.Telegram,
        returnUrl: 'https://app.example.test/after-link',
      }),
    ).resolves.toMatchObject({
      intent: 'link',
      provider: 'telegram',
    });
    delete process.env.AUTH_ALLOWED_RETURN_URLS;

    await expect(
      service.telegramBotLink({
        linkToken: linkToken.token,
        providerSubject: '99',
        username: 'linked',
      }),
    ).resolves.toMatchObject({
      status: 'linked',
      identity: { providerSubject: '99', channel: 'telegram_bot' },
    });

    await expect(
      service.telegramBotLink({
        linkToken: linkToken.token,
        providerSubject: '99',
      }),
    ).rejects.toThrow('link_token_expired');
  });

  it('maps disabled and missing Telegram TMA configuration to stable errors', async () => {
    const { service } = createService();

    process.env.AUTH_TELEGRAM_ENABLED = 'false';
    await expect(service.telegramTma({ betterAuthProviderSubject: '777', initData: 'signed' })).rejects.toThrow(
      'provider_disabled',
    );

    delete process.env.AUTH_TELEGRAM_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(service.telegramTma({ betterAuthProviderSubject: '777', initData: 'signed' })).rejects.toThrow(
      'provider_not_configured',
    );
  });

  it('validates raw TMA initData before parsing and maps invalid initData to a stable error', async () => {
    const { service } = createService();
    tmaMocks.validate.mockImplementation(() => {
      throw new Error('bad init data');
    });

    await expect(
      service.telegramTma({ betterAuthProviderSubject: '777', initData: 'query_id=raw&user=untrusted' }),
    ).rejects.toThrow('invalid_signature');

    expect(tmaMocks.validate).toHaveBeenCalledWith('query_id=raw&user=untrusted', botToken, { expiresIn: 300 });
    expect(tmaMocks.parse).not.toHaveBeenCalled();
  });

  it('uses validated TMA parsed data for identity and preserves start_param link intent metadata', async () => {
    const { service, social } = createService();
    tmaMocks.parse.mockReturnValue({
      start_param: 'link-intent-42',
      user: {
        first_name: 'Ada',
        id: 777,
        language_code: 'ru',
        last_name: 'Lovelace',
        photo_url: 'https://cdn.example.test/avatar.png',
        username: 'ada',
      },
    });

    const result = await service.telegramTma({
      betterAuthProviderSubject: '777',
      initData: 'signed-init-data',
      returnUrl: null,
    });
    const identity = await social.findIdentity(AuthProvider.Telegram, '777', DefaultAuthTenantId);

    expect(result).toMatchObject({
      status: 'authenticated',
      identity: {
        avatarUrl: 'https://cdn.example.test/avatar.png',
        channel: 'telegram_tma',
        displayName: 'Ada Lovelace',
        providerSubject: '777',
        username: 'ada',
      },
    });
    expect(identity._unsafeUnwrap()?.profileMetadata).toEqual({
      source: 'telegram_tma',
      startParam: 'link-intent-42',
    });

    tmaMocks.parse.mockReturnValueOnce({
      user: {
        id: 778,
      },
    });
    await expect(
      service.telegramTma({
        betterAuthProviderSubject: '778',
        initData: 'signed-init-data-with-minimal-user',
      }),
    ).resolves.toMatchObject({
      identity: {
        avatarUrl: null,
        displayName: null,
        providerSubject: '778',
        username: null,
      },
    });
  });

  it('rejects a TMA payload that does not match the Better Auth Telegram account', async () => {
    const { service } = createService();
    tmaMocks.parse.mockReturnValue({ user: { id: 777 } });

    await expect(service.telegramTma({ betterAuthProviderSubject: '778', initData: 'signed' })).rejects.toThrow(
      'telegram_identity_mismatch',
    );
  });

  it('rejects TMA init data without a user id', async () => {
    const { service } = createService();
    tmaMocks.parse.mockReturnValue({ user: { username: 'missing-id' } });

    await expect(service.telegramTma({ betterAuthProviderSubject: '777', initData: 'signed' })).rejects.toThrow(
      'invalid_signature',
    );
  });

  it('stores Discord state with PKCE, validates callback state once, and rejects replay', async () => {
    const { service } = createService();

    const authorization = service.createDiscordAuthorizationRequest({});

    expect(authorization.authorizationUrl).toContain('discord.example.test');
    expect(arcticMocks.authorizationUrl).toHaveBeenCalledWith('discord-state', 'discord-code-verifier', [
      'identify',
      'email',
    ]);

    await expect(service.discordCallback({ code: 'callback-code', state: 'wrong-state' })).rejects.toThrow(
      'invalid_state',
    );

    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'discord-state',
      }),
    ).resolves.toMatchObject({
      identity: {
        channel: 'discord_oauth',
        providerSubject: 'discord-subject',
      },
      status: 'authenticated',
    });
    expect(arcticMocks.validateAuthorizationCode).toHaveBeenCalledWith('callback-code', 'discord-code-verifier');

    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'discord-state',
      }),
    ).rejects.toThrow('invalid_state');
  });

  it('evicts the oldest Discord state once the in-memory cap is reached', async () => {
    const { service } = createService();
    process.env.DISCORD_OAUTH_STATE_MAX_ENTRIES = '2';
    arcticMocks.generateState
      .mockReturnValueOnce('state-1')
      .mockReturnValueOnce('state-2')
      .mockReturnValueOnce('state-3');

    service.createDiscordAuthorizationRequest({});
    service.createDiscordAuthorizationRequest({});
    service.createDiscordAuthorizationRequest({});

    await expect(service.discordCallback({ code: 'callback-code', state: 'state-1' })).rejects.toThrow('invalid_state');
    await expect(service.discordCallback({ code: 'callback-code', state: 'state-3' })).resolves.toMatchObject({
      status: 'authenticated',
    });
  });

  it('rejects expired Discord callback state and disallowed return URLs', async () => {
    const { service } = createService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    process.env.DISCORD_OAUTH_STATE_TTL_SECONDS = '1';

    service.createDiscordAuthorizationRequest({});
    vi.setSystemTime(new Date('2026-06-14T12:00:02.000Z'));

    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'discord-state',
      }),
    ).rejects.toThrow('invalid_state');

    vi.useRealTimers();
    process.env.AUTH_ALLOWED_RETURN_URLS = 'https://app.example.test/';
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'https://evil.example.test/callback',
      }),
    ).toThrow('return_url_not_allowed');
  });

  it('rejects Discord callbacks missing code or state and prunes expired stored states', async () => {
    const { service } = createService();

    await expect(service.discordCallback({ code: '', state: 'state' })).rejects.toThrow('invalid_state');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    process.env.DISCORD_OAUTH_STATE_TTL_SECONDS = '1';
    arcticMocks.generateState.mockReturnValueOnce('expired-state').mockReturnValueOnce('fresh-state');

    service.createDiscordAuthorizationRequest({});
    vi.setSystemTime(new Date('2026-06-14T12:00:02.000Z'));
    service.createDiscordAuthorizationRequest({});

    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'expired-state',
      }),
    ).rejects.toThrow('invalid_state');
    await expect(service.discordCallback({ code: 'callback-code', state: 'fresh-state' })).resolves.toMatchObject({
      status: 'authenticated',
    });
    vi.useRealTimers();
  });

  it('validates return URLs by structured origin instead of raw prefix', () => {
    const { service } = createService();

    // Accepts a legitimately configured origin (including sub-paths).
    process.env.AUTH_ALLOWED_RETURN_URLS = 'https://user-app.example.com';
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'https://user-app.example.com/callback',
      }),
    ).not.toThrow();

    // Rejects the classic prefix-matching bypass (suffix-appended host).
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'https://user-app.example.com.evil.com/callback',
      }),
    ).toThrow('return_url_not_allowed');

    // Rejects URLs carrying userinfo credentials even when the host matches.
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'https://user:pass@user-app.example.com/callback',
      }),
    ).toThrow('return_url_not_allowed');

    // Rejects non-http(s) schemes such as javascript:.
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'javascript:alert(document.domain)',
      }),
    ).toThrow('return_url_not_allowed');

    // Enforces a path-segment boundary: "/app" must not match "/appevil".
    process.env.AUTH_ALLOWED_RETURN_URLS = 'https://user-app.example.com/app';
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'https://user-app.example.com/appevil',
      }),
    ).toThrow('return_url_not_allowed');
    expect(() =>
      service.createDiscordAuthorizationRequest({
        returnUrl: 'https://user-app.example.com/app/next',
      }),
    ).not.toThrow();
  });

  it('maps Discord provider disabled and missing configuration to stable errors', () => {
    const { service } = createService();

    process.env.AUTH_DISCORD_ENABLED = 'false';
    expect(() => service.createDiscordAuthorizationRequest({})).toThrow('provider_disabled');

    delete process.env.AUTH_DISCORD_ENABLED;
    delete process.env.DISCORD_CLIENT_SECRET;
    expect(() => service.createDiscordAuthorizationRequest({})).toThrow('provider_not_configured');
  });

  it('maps failed Discord userinfo responses to provider errors', async () => {
    const { service } = createService();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }));

    service.createDiscordAuthorizationRequest({});
    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'discord-state',
      }),
    ).rejects.toThrow('provider_not_configured');
  });

  it('maps Discord verified versus unverified email without trusting unverified email for users', async () => {
    const { service } = createService();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          email: 'unverified@example.com',
          id: 'discord-unverified',
          username: 'discord-unverified',
          verified: false,
        }),
      ),
    );

    service.createDiscordAuthorizationRequest({});
    const unverified = await service.discordCallback({
      code: 'callback-code',
      state: 'discord-state',
    });

    expect(unverified.identity).toMatchObject({
      email: null,
      emailVerified: false,
      providerSubject: 'discord-unverified',
    });
    expect(unverified.session?.user.email).toBeNull();

    arcticMocks.generateState.mockReturnValueOnce('discord-state-2');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          email: 'verified@example.com',
          global_name: 'Verified User',
          id: 'discord-verified',
          username: 'discord-verified',
          verified: true,
        }),
      ),
    );

    service.createDiscordAuthorizationRequest({});
    const verified = await service.discordCallback({
      code: 'callback-code',
      state: 'discord-state-2',
    });

    expect(verified.identity).toMatchObject({
      email: 'verified@example.com',
      emailVerified: true,
    });
    expect(verified.session?.user.email).toBe('verified@example.com');

    arcticMocks.generateState.mockReturnValueOnce('discord-state-3');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'discord-minimal',
          verified: true,
        }),
      ),
    );

    service.createDiscordAuthorizationRequest({});
    const minimal = await service.discordCallback({
      code: 'callback-code',
      state: 'discord-state-3',
    });

    expect(minimal.identity).toMatchObject({
      displayName: null,
      email: null,
      emailVerified: true,
      providerSubject: 'discord-minimal',
      username: null,
    });

    arcticMocks.generateState.mockReturnValueOnce('discord-state-4');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'discord-unknown-verification',
        }),
      ),
    );

    service.createDiscordAuthorizationRequest({});
    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'discord-state-4',
      }),
    ).resolves.toMatchObject({
      identity: {
        emailVerified: false,
        providerSubject: 'discord-unknown-verification',
      },
    });
  });

  it('honors Discord provider token storage toggle and keeps provider tokens out of responses', async () => {
    const social = new CapturingSocialAuthStore();
    const { service } = createService(social);

    service.createDiscordAuthorizationRequest({});
    const disabled = await service.discordCallback({
      code: 'callback-code',
      state: 'discord-state',
    });

    expect(social.persistedProviderTokens).toHaveLength(0);
    expect(JSON.stringify(disabled)).not.toContain(discordAccessValue);
    expect(JSON.stringify(disabled)).not.toContain(discordRefreshValue);

    arcticMocks.generateState.mockReturnValueOnce('discord-state-2');
    arcticMocks.validateAuthorizationCode.mockResolvedValueOnce(discordTokens({ scopes: ['identify', 'email'] }));
    process.env.DISCORD_TOKEN_STORAGE_ENABLED = 'true';
    service.createDiscordAuthorizationRequest({});
    const enabled = await service.discordCallback({
      code: 'callback-code',
      state: 'discord-state-2',
    });

    expect(social.persistedProviderTokens).toEqual([
      expect.objectContaining({
        plaintext: discordAccessValue,
        provider: 'discord',
        scopes: ['identify', 'email'],
        tokenKind: 'access',
      }),
      expect.objectContaining({
        plaintext: discordRefreshValue,
        provider: 'discord',
        scopes: ['identify', 'email'],
        tokenKind: 'refresh',
      }),
    ]);
    expect(JSON.stringify(enabled)).not.toContain(discordAccessValue);
    expect(JSON.stringify(enabled)).not.toContain(discordRefreshValue);
  });

  it('uses configured Discord scopes and skips refresh-token storage when no refresh token is present', async () => {
    const social = new CapturingSocialAuthStore();
    const { service } = createService(social);
    arcticMocks.validateAuthorizationCode.mockResolvedValueOnce(discordTokens({ refreshValue: null }));
    process.env.DISCORD_TOKEN_STORAGE_ENABLED = 'true';
    process.env.DISCORD_OAUTH_SCOPES = 'identify,email';

    service.createDiscordAuthorizationRequest({});
    await service.discordCallback({
      code: 'callback-code',
      state: 'discord-state',
    });

    expect(social.persistedProviderTokens).toEqual([
      expect.objectContaining({
        scopes: ['identify', 'email'],
        tokenKind: 'access',
      }),
    ]);

    const withoutConfiguredScopes = new CapturingSocialAuthStore();
    const { service: serviceWithoutConfiguredScopes } = createService(withoutConfiguredScopes);
    arcticMocks.generateState.mockReturnValueOnce('discord-state-without-scopes');
    arcticMocks.validateAuthorizationCode.mockResolvedValueOnce(discordTokens({ refreshValue: null }));
    delete process.env.DISCORD_OAUTH_SCOPES;
    serviceWithoutConfiguredScopes.createDiscordAuthorizationRequest({});
    await serviceWithoutConfiguredScopes.discordCallback({
      code: 'callback-code',
      state: 'discord-state-without-scopes',
    });
    expect(withoutConfiguredScopes.persistedProviderTokens[0]?.scopes).toEqual([]);
  });

  it('enforces link token TTL, purpose, revoke, replay, and hash-only persistence', async () => {
    const social = new CapturingSocialAuthStore();
    const { auth, service } = createService(social);
    const passwordSession = await auth.register({
      email: 'hash-link@example.com',
      password: 'password123',
    });

    process.env.AUTH_LINK_TOKEN_TTL_SECONDS = '1';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T12:00:00.000Z'));
    const expiring = await service.createLinkToken({
      intent: ExternalAuthIntent.Link,
      provider: AuthProvider.Telegram,
      userId: passwordSession.user.id,
    });

    expect(social.createdLinkTokenHashes[0]).toHaveLength(64);
    expect(social.createdLinkTokenHashes[0]).not.toBe(expiring.token);
    await expect(
      social.consumeLinkToken(
        social.createdLinkTokenHashes[0],
        ExternalAuthIntent.Login,
        DefaultAuthTenantId,
        new Date(),
      ),
    ).resolves.toMatchObject({ value: null });

    vi.setSystemTime(new Date('2026-06-14T12:00:02.000Z'));
    await expect(
      service.telegramBotLink({
        linkToken: expiring.token,
        providerSubject: '501',
      }),
    ).rejects.toThrow('link_token_expired');

    vi.setSystemTime(new Date('2026-06-14T12:01:00.000Z'));
    const revoked = await service.createLinkToken({
      provider: AuthProvider.Telegram,
      userId: passwordSession.user.id,
    });
    await expect(
      social.revokeLinkToken(social.createdLinkTokenHashes.at(-1) ?? 'missing-hash', DefaultAuthTenantId, new Date()),
    ).resolves.toMatchObject({ value: true });
    await expect(
      service.telegramBotLink({
        linkToken: revoked.token,
        providerSubject: '502',
      }),
    ).rejects.toThrow('link_token_expired');

    const usable = await service.createLinkToken({
      provider: AuthProvider.Telegram,
      userId: passwordSession.user.id,
    });
    await expect(
      service.telegramBotLink({
        linkToken: usable.token,
        providerSubject: '503',
      }),
    ).resolves.toMatchObject({ status: 'linked' });
    await expect(
      service.telegramBotLink({
        linkToken: usable.token,
        providerSubject: '504',
      }),
    ).rejects.toThrow('link_token_expired');
  });

  it('hides provider identity conflicts and requires recent auth plus another usable method before unlink', async () => {
    const social = new CapturingSocialAuthStore();
    const { auth, service } = createService(social);
    const first = await auth.register({
      email: 'first@example.com',
      password: 'password123',
    });
    const second = await auth.register({
      email: 'second@example.com',
      password: 'password123',
    });
    const linked = await social.upsertIdentity({
      channel: AuthProviderChannel.TelegramBot,
      email: null,
      provider: AuthProvider.Telegram,
      providerSubject: 'conflict-subject',
      tenantId: DefaultAuthTenantId,
      userId: first.user.id,
    });

    await expect(
      service.telegramBotLink({
        linkToken: (
          await service.createLinkToken({
            provider: AuthProvider.Telegram,
            userId: second.user.id,
          })
        ).token,
        providerSubject: 'conflict-subject',
      }),
    ).resolves.toMatchObject({
      code: 'account_conflict',
      message: 'Provider identity cannot be linked.',
      status: 'conflict',
    });

    await expect(
      service.unlinkProviderIdentity(linked._unsafeUnwrap().id, {
        subject: first.user.id,
        tenantId: DefaultAuthTenantId,
      }),
    ).rejects.toThrow('step_up_required');

    await expect(
      service.unlinkProviderIdentity(linked._unsafeUnwrap().id, {
        authTime: Math.floor(Date.now() / 1000),
        subject: first.user.id,
        tenantId: DefaultAuthTenantId,
      }),
    ).rejects.toThrow('last_method_unlink_forbidden');

    await social.upsertMethod({
      amr: ['pwd'],
      externalIdentityId: linked._unsafeUnwrap().id,
      method: AuthProviderChannel.TelegramBot,
      tenantId: DefaultAuthTenantId,
      userId: first.user.id,
    });
    await expect(
      service.unlinkProviderIdentity(linked._unsafeUnwrap().id, {
        authTime: Math.floor(Date.now() / 1000),
        subject: first.user.id,
        tenantId: DefaultAuthTenantId,
      }),
    ).resolves.toEqual({ unlinked: true });
    expect(social.revokedProviderTokenCalls).toBe(1);
  });

  it('maps social store failures for link tokens, identity listing, unlinking, and linking', async () => {
    const activeUser = authUserRecord({ id: 'linked-user-id' });

    await expect(
      createServiceWithStores(
        { create: () => okAsync(activeUser) },
        {
          createLinkToken: () => errAsync({ code: 'repository_error', message: 'link failed' }),
        },
      ).service.createLinkToken({
        provider: AuthProvider.Telegram,
        userId: activeUser.id,
      }),
    ).rejects.toThrow('link failed');

    await expect(
      createServiceWithStores(
        {},
        {
          listIdentities: () => errAsync({ code: 'repository_error', message: 'list failed' }),
        },
      ).service.listProviderIdentities(activeUser.id),
    ).rejects.toThrow('list failed');

    await expect(
      createServiceWithStores(
        {},
        {
          countMethods: () => errAsync({ code: 'repository_error', message: 'count failed' }),
        },
      ).service.unlinkProviderIdentity('identity-id', {
        authTime: Math.floor(Date.now() / 1000),
        subject: activeUser.id,
        tenantId: DefaultAuthTenantId,
      }),
    ).rejects.toThrow('count failed');

    await expect(
      createServiceWithStores(
        {},
        {
          countMethods: () => okAsync(2),
          revokeProviderTokens: () => okAsync(undefined),
          deleteIdentity: () => errAsync({ code: 'repository_error', message: 'delete failed' }),
        },
      ).service.unlinkProviderIdentity('identity-id', {
        authTime: Math.floor(Date.now() / 1000),
        subject: activeUser.id,
        tenantId: DefaultAuthTenantId,
      }),
    ).rejects.toThrow('delete failed');

    await expect(
      createServiceWithStores(
        {},
        {
          consumeLinkToken: () => errAsync({ code: 'repository_error', message: 'consume failed' }),
        },
      ).service.telegramBotLink({
        linkToken: 'link-token',
        providerSubject: 'telegram-subject',
      }),
    ).rejects.toThrow('consume failed');

    await expect(
      createServiceWithStores(
        {},
        {
          consumeLinkToken: () => okAsync({ userId: null }),
        },
      ).service.telegramBotLink({
        linkToken: 'link-token',
        providerSubject: 'telegram-subject',
      }),
    ).rejects.toThrow('link_token_expired');

    await expect(
      createServiceWithStores(
        {},
        {
          consumeLinkToken: () => okAsync({ userId: activeUser.id }),
          findIdentity: () => errAsync({ code: 'repository_error', message: 'find failed' }),
        },
      ).service.telegramBotLink({
        linkToken: 'link-token',
        providerSubject: 'telegram-subject',
      }),
    ).rejects.toThrow('find failed');

    await expect(
      createServiceWithStores(
        {},
        {
          consumeLinkToken: () => okAsync({ userId: activeUser.id }),
          findIdentity: () => okAsync(null),
          upsertIdentity: () => errAsync({ code: 'repository_error', message: 'upsert failed' }),
        },
      ).service.telegramBotLink({
        linkToken: 'link-token',
        providerSubject: 'telegram-subject',
      }),
    ).rejects.toThrow('upsert failed');
  });

  it('lists provider identities and links a verified profile through link intent', async () => {
    const { auth, service, social } = createService();
    const passwordSession = await auth.register({
      email: 'link-intent@example.com',
      password: 'password123',
    });

    const linked = await service.telegramOidcSession({
      intent: ExternalAuthIntent.Link,
      profile: { avatarUrl: null, displayName: null, providerSubject: '904' },
      principal: {
        subject: passwordSession.user.id,
        tenantId: DefaultAuthTenantId,
      },
    });

    expect(linked).toMatchObject({
      status: 'linked',
      identity: {
        displayName: null,
        providerSubject: '904',
        username: null,
      },
    });
    await expect(service.listProviderIdentities(passwordSession.user.id)).resolves.toHaveLength(1);
    expect((await social.countMethods(passwordSession.user.id, DefaultAuthTenantId))._unsafeUnwrap()).toBeGreaterThan(
      1,
    );

    const linkToken = await service.createLinkToken({
      provider: AuthProvider.Telegram,
      userId: passwordSession.user.id,
    });
    await expect(
      service.telegramOidcSession({
        intent: ExternalAuthIntent.Link,
        linkToken: linkToken.token,
        profile: { avatarUrl: null, displayName: null, providerSubject: '905' },
      }),
    ).resolves.toMatchObject({ status: 'linked' });
  });

  it('uses stored Discord principals when callback input has no principal', async () => {
    const { auth, service } = createService();
    const passwordSession = await auth.register({
      email: 'discord-link@example.com',
      password: 'password123',
    });

    service.createDiscordAuthorizationRequest({
      intent: ExternalAuthIntent.Link,
      principal: {
        subject: passwordSession.user.id,
        tenantId: DefaultAuthTenantId,
      },
    });

    await expect(
      service.discordCallback({
        code: 'callback-code',
        state: 'discord-state',
      }),
    ).resolves.toMatchObject({ status: 'linked' });
  });

  it('maps external login store failures and inactive linked users', async () => {
    const existingIdentity = {
      id: 'identity-id',
      tenantId: DefaultAuthTenantId,
      userId: 'linked-user-id',
      provider: AuthProvider.Telegram,
      providerSubject: '42',
      channel: AuthProviderChannel.TelegramOidc,
      email: null,
      emailVerified: false,
      displayName: null,
      username: 'ada',
      avatarUrl: null,
      profileMetadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAuthenticatedAt: null,
    };

    await expect(
      createServiceWithStores(
        {},
        {
          findIdentity: () => errAsync({ code: 'repository_error', message: 'identity failed' }),
        },
      ).service.telegramOidcSession({
        profile: { avatarUrl: null, displayName: null, providerSubject: '900' },
      }),
    ).rejects.toThrow('identity failed');

    await expect(
      createServiceWithStores(
        { findById: () => okAsync(null) },
        { findIdentity: () => okAsync(existingIdentity) },
      ).service.telegramOidcSession({
        profile: { avatarUrl: null, displayName: null, providerSubject: '42' },
      }),
    ).rejects.toThrow('Invalid external identity');

    await expect(
      createServiceWithStores(
        {
          findById: () => okAsync(authUserRecord({ id: 'linked-user-id' })),
          recordLogin: () => okAsync(null),
        },
        {
          findIdentity: () => okAsync(existingIdentity),
          upsertIdentity: () => errAsync({ code: 'repository_error', message: 'identity upsert' }),
        },
      ).service.telegramOidcSession({
        profile: { avatarUrl: null, displayName: null, providerSubject: '42' },
      }),
    ).rejects.toThrow('identity upsert');

    await expect(
      createServiceWithStores(
        {
          create: () => errAsync({ code: 'repository_error', message: 'create failed' }),
        },
        { findIdentity: () => okAsync(null) },
      ).service.telegramOidcSession({
        profile: { avatarUrl: null, displayName: null, providerSubject: '901' },
      }),
    ).rejects.toThrow('create failed');

    await expect(
      createServiceWithStores(
        {
          create: () => okAsync(authUserRecord({ id: 'created-user-id' })),
        },
        {
          findIdentity: () => okAsync(null),
          upsertIdentity: () => errAsync({ code: 'repository_error', message: 'new identity' }),
        },
      ).service.telegramOidcSession({
        profile: { avatarUrl: null, displayName: null, providerSubject: '902' },
      }),
    ).rejects.toThrow('new identity');

    await expect(
      createServiceWithStores(
        {
          create: () => okAsync(authUserRecord({ id: 'created-user-id' })),
        },
        new InMemorySocialAuthStore(),
      ).service.telegramOidcSession({
        intent: ExternalAuthIntent.Link,
        profile: { avatarUrl: null, displayName: null, providerSubject: '903' },
      }),
    ).rejects.toThrow('link_token_expired');
  });

  it('keeps password session claims backward compatible and maps nullable external email claims', async () => {
    const { auth, service } = createService();
    const passwordSession = await auth.register({
      email: 'claims@example.com',
      password: 'password123',
    });

    expect(passwordSession).toMatchObject({
      amr: ['pwd'],
      authChannel: 'password',
      authProvider: 'password',
    });

    const external = service.createSessionWithClaims(
      {
        email: null,
        id: 'external-user-id',
        passwordHash: 'hash',
        permissions: ['profile:read'],
        roles: ['user'],
        status: 'active',
        tenantId: DefaultAuthTenantId,
        theme: AuthenticatedTheme.System,
      },
      {
        amr: ['telegram'],
        authChannel: AuthProviderChannel.TelegramTma,
        authProvider: AuthProvider.Telegram,
        authTime: 1_797_204_800,
        externalIdentityId: 'external-identity-id',
      },
      { AUTH_JWT_SECRET: testJwtSecretValue },
    );

    expect(external.user.email).toBeNull();
    expect(
      validateBearerAuthorization(`Bearer ${external.accessToken}`, {
        AUTH_JWT_SECRET: testJwtSecretValue,
      }),
    ).toMatchObject({
      amr: ['telegram'],
      authChannel: 'telegram_tma',
      authProvider: 'telegram',
      email: null,
      externalIdentityId: 'external-identity-id',
      subject: 'external-user-id',
    });
  });
});
