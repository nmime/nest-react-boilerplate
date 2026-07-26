// @requirements REQ-AUTH-ACCESS-001
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportedLocales } from '@app/backend-common-i18n';
import {
  AuthenticatedTheme,
  AuthProvider,
  AuthProviderChannel,
  DefaultAuthTenantId,
  ExternalAuthIntent,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type AuthenticatedResponse,
  type AuthenticatedSession,
  type AuthSessionView,
  type ExternalAuthIdentityView,
} from '@app/backend-feature-auth-shared';
import type { AuthService } from '../../application/auth.service';
import type { BetterAuthTelegramSessionService } from '../../application/better-auth-telegram-session.service';
import type { ExternalAuthService } from '../../application/external-auth.service';
import { AuthController, DiscordCallbackQueryDto, SessionCookieName } from './auth.controller';

type AuthControllerService = Pick<
  AuthService,
  | 'getUserById'
  | 'issueEmailVerificationToken'
  | 'issuePasswordResetToken'
  | 'login'
  | 'register'
  | 'updateUserPreferences'
>;

type ExternalAuthControllerService = Pick<
  ExternalAuthService,
  | 'createDiscordAuthorizationRequest'
  | 'createLinkToken'
  | 'discordCallback'
  | 'listProviderIdentities'
  | 'telegramBotLink'
  | 'telegramOidcSession'
  | 'telegramTma'
  | 'unlinkProviderIdentity'
>;

interface RequestFixture {
  request: AuthenticatedRequest;
  response: AuthenticatedResponse;
  reply: AuthenticatedResponse;
  rawResponse: AuthenticatedResponse;
  session: Required<Pick<AuthenticatedSession, 'destroy' | 'regenerate' | 'save'>> & Pick<AuthenticatedSession, 'user'>;
}

function createSessionLifecycle(): RequestFixture['session']['destroy'] {
  const lifecycle = vi.fn((callback?: (error?: unknown) => void): Promise<void> | void => {
    if (callback) {
      callback();
      return;
    }

    return Promise.resolve();
  });

  return lifecycle as unknown as RequestFixture['session']['destroy'];
}

const sessionView = {
  user: {
    id: 'user-id',
    tenantId: DefaultAuthTenantId,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    locale: 'ru',
    theme: AuthenticatedTheme.Dark,
    roles: ['user', 'admin'],
    permissions: ['profile:read', 'admin:profile:read'],
  },
} satisfies AuthSessionView;

const externalIdentity = {
  avatarUrl: null,
  channel: AuthProviderChannel.TelegramOidc,
  displayName: 'Ada Lovelace',
  email: null,
  emailVerified: null,
  id: 'identity-id',
  lastAuthenticatedAt: null,
  linkedAt: '2026-07-05T00:00:00.000Z',
  provider: AuthProvider.Telegram,
  providerSubject: '777',
  username: 'ada',
} satisfies ExternalAuthIdentityView;

function createService(
  overrides: Partial<{
    getUserById: AuthControllerService['getUserById'];
    issueEmailVerificationToken: AuthControllerService['issueEmailVerificationToken'];
    issuePasswordResetToken: AuthControllerService['issuePasswordResetToken'];
    login: AuthControllerService['login'];
    register: AuthControllerService['register'];
    updateUserPreferences: AuthControllerService['updateUserPreferences'];
  }> = {},
): AuthControllerService {
  return {
    register: vi.fn(() => Promise.resolve(sessionView)),
    login: vi.fn(() => Promise.resolve(sessionView)),
    issueEmailVerificationToken: vi.fn(() => Promise.resolve('verification-token')),
    issuePasswordResetToken: vi.fn(() => Promise.resolve('reset-token')),
    getUserById: vi.fn(() => Promise.resolve(sessionView.user)),
    updateUserPreferences: vi.fn(() => Promise.resolve(sessionView.user)),
    ...overrides,
  };
}

function createExternalAuthService(
  overrides: Partial<ExternalAuthControllerService> = {},
): ExternalAuthControllerService {
  const service: ExternalAuthControllerService = {
    telegramTma: vi.fn(() => Promise.resolve({ status: 'authenticated' as const, session: sessionView })),
    telegramOidcSession: vi.fn(() => Promise.resolve({ status: 'authenticated' as const, session: sessionView })),
    telegramBotLink: vi.fn(() => Promise.resolve({ status: 'linked' as const, identity: externalIdentity })),
    createDiscordAuthorizationRequest: vi.fn(() => ({
      authorizationUrl: 'https://discord.example.test/oauth',
      stateExpiresAt: '2026-07-05T00:00:00.000Z',
    })),
    discordCallback: vi.fn(() => Promise.resolve({ status: 'authenticated' as const, session: sessionView })),
    listProviderIdentities: vi.fn(() => Promise.resolve([externalIdentity])),
    unlinkProviderIdentity: vi.fn(() => Promise.resolve({ unlinked: true })),
    createLinkToken: vi.fn(() =>
      Promise.resolve({
        token: 'link-token',
        expiresAt: '2026-07-05T00:00:00.000Z',
        provider: AuthProvider.Telegram as AuthProvider.Telegram,
        intent: ExternalAuthIntent.Link as ExternalAuthIntent.Link,
      }),
    ),
    ...overrides,
  };
  return service;
}

function createRequest(
  principal?: AuthenticatedPrincipal,
  response: AuthenticatedResponse = { clearCookie: vi.fn() },
): RequestFixture {
  const session: RequestFixture['session'] = {
    ...(principal ? { user: principal } : {}),
    regenerate: createSessionLifecycle(),
    save: createSessionLifecycle(),
    destroy: createSessionLifecycle(),
  };
  const reply: AuthenticatedResponse = { clearCookie: vi.fn() };
  const rawResponse: AuthenticatedResponse = { clearCookie: vi.fn() };

  return {
    request: {
      ...(principal ? { auth: principal, user: principal } : {}),
      raw: { res: rawResponse },
      reply,
      res: response,
      session,
    },
    response,
    reply,
    rawResponse,
    session,
  };
}

function toController(
  service: AuthControllerService,
  externalAuth: ExternalAuthControllerService = createExternalAuthService(),
  betterAuthTelegramSession: Pick<BetterAuthTelegramSessionService, 'requireTelegramProfile'> = {
    requireTelegramProfile: vi.fn(() =>
      Promise.resolve({
        avatarUrl: 'https://cdn.example.test/ada.png',
        displayName: 'Ada Lovelace',
        providerSubject: '777',
      }),
    ),
  },
): AuthController {
  return new AuthController(
    service as AuthService,
    externalAuth as ExternalAuthService,
    betterAuthTelegramSession as BetterAuthTelegramSessionService,
  );
}

describe('AuthController', () => {
  afterEach(() => {
    delete process.env[SessionCookieName];
  });

  it('registers and exposes current session state in ok responses', async () => {
    const service = createService();
    const controller = toController(service);
    const { request, session } = createRequest();
    const principal: AuthenticatedPrincipal = {
      subject: sessionView.user.id,
      tenantId: sessionView.user.tenantId,
      email: sessionView.user.email,
      displayName: sessionView.user.displayName,
      locale: sessionView.user.locale,
      theme: sessionView.user.theme,
      roles: sessionView.user.roles,
      permissions: sessionView.user.permissions,
    };

    await expect(
      controller.register(
        {
          email: sessionView.user.email,
          password: 'password123',
          displayName: sessionView.user.displayName,
          locale: sessionView.user.locale,
        },
        request,
      ),
    ).resolves.toEqual({ data: sessionView });
    await expect(controller.me(principal)).resolves.toEqual({
      data: {
        principal,
        user: sessionView.user,
      },
    });
    expect(controller.locales()).toEqual({
      data: { supportedLocales },
    });

    expect(service.register).toHaveBeenCalledWith({
      email: sessionView.user.email,
      password: 'password123',
      displayName: sessionView.user.displayName,
      locale: sessionView.user.locale,
    });
    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
  });

  it('stores identity-only session data while exposing the resolved request principal', async () => {
    const service = createService();
    const controller = toController(service);
    const { request, session } = createRequest();

    await expect(
      controller.login({ email: sessionView.user.email, password: 'password123' }, request),
    ).resolves.toEqual({ data: sessionView });

    const expectedPrincipal: AuthenticatedPrincipal = {
      subject: sessionView.user.id,
      tenantId: sessionView.user.tenantId,
      email: sessionView.user.email,
      displayName: sessionView.user.displayName,
      locale: sessionView.user.locale,
      theme: sessionView.user.theme,
      roles: sessionView.user.roles,
      permissions: sessionView.user.permissions,
    };

    expect(service.login).toHaveBeenCalledWith({
      email: sessionView.user.email,
      password: 'password123',
    });
    expect(session.user).toEqual({ ...expectedPrincipal, roles: [], permissions: [] });
    expect(request.user).toEqual(expectedPrincipal);
    expect(request.auth).toEqual(expectedPrincipal);
    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
  });

  it('preserves session authentication metadata when updating preferences', async () => {
    const updatedUser = {
      ...sessionView.user,
      displayName: 'Ada Byron',
      locale: 'en' as const,
      theme: AuthenticatedTheme.Light,
    };
    const service = createService({
      updateUserPreferences: vi.fn(() => Promise.resolve(updatedUser)),
    });
    const controller = toController(service);
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      locale: 'ru',
      theme: AuthenticatedTheme.Dark,
      amr: ['pwd'],
      authProvider: AuthProvider.Password,
      authChannel: AuthProviderChannel.Password,
      authTime: 1_721_865_600,
      roles: ['user'],
      permissions: ['profile:read'],
    };
    const { request, session } = createRequest(principal);

    await expect(controller.updatePreferences(principal, { locale: 'en', theme: 'light' }, request)).resolves.toEqual({
      data: updatedUser,
    });

    expect(service.updateUserPreferences).toHaveBeenCalledWith('user-id', DefaultAuthTenantId, {
      locale: 'en',
      theme: 'light',
    });
    expect(session.user).toEqual({
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      email: 'user@example.com',
      displayName: 'Ada Byron',
      locale: 'en',
      theme: 'light',
      amr: ['pwd'],
      authProvider: AuthProvider.Password,
      authChannel: AuthProviderChannel.Password,
      authTime: 1_721_865_600,
      roles: [],
      permissions: [],
    });
    expect(request.user).toEqual({
      ...session.user,
      roles: ['user', 'admin'],
      permissions: ['profile:read', 'admin:profile:read'],
    });
    expect(request.auth).toEqual(request.user);
    expect(session.save).toHaveBeenCalledOnce();
  });

  it('updates locale and persists the refreshed principal', async () => {
    const updatedUser = {
      ...sessionView.user,
      locale: 'ru' as const,
    };
    const service = createService({
      updateUserPreferences: vi.fn(() => Promise.resolve(updatedUser)),
    });
    const controller = toController(service);
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      roles: ['user'],
      permissions: ['profile:read'],
    };
    const { request, session } = createRequest(principal);

    await expect(controller.updateLocale(principal, { locale: 'ru' }, request)).resolves.toEqual({ data: updatedUser });

    expect(service.updateUserPreferences).toHaveBeenCalledWith('user-id', DefaultAuthTenantId, {
      locale: 'ru',
    });
    expect(session.user).toMatchObject({
      subject: 'user-id',
      locale: 'ru',
      theme: 'dark',
    });
    expect(session.save).toHaveBeenCalledOnce();
  });

  it('redirects the discord callback when a return url is present and returns JSON otherwise', async () => {
    const withReturnUrl = {
      status: 'authenticated',
      returnUrl: 'https://app.example.test/next',
    };
    const withoutReturnUrl = { status: 'authenticated' };
    const discordCallback = vi.fn().mockResolvedValueOnce(withReturnUrl).mockResolvedValueOnce(withoutReturnUrl);
    const externalAuth = { discordCallback } as unknown as ExternalAuthService;
    const controller = toController(createService(), externalAuth as ExternalAuthControllerService);
    const query: DiscordCallbackQueryDto = {
      code: 'oauth-code',
      state: 'oauth-state',
    };
    const { request } = createRequest();

    const redirectResponse: AuthenticatedResponse = {
      redirect: vi.fn(),
      send: vi.fn(),
    };
    await controller.discordCallback(query, request, redirectResponse);
    expect(redirectResponse.redirect).toHaveBeenCalledWith('https://app.example.test/next', 302);
    expect(redirectResponse.send).not.toHaveBeenCalled();

    const jsonResponse: AuthenticatedResponse = {
      redirect: vi.fn(),
      send: vi.fn(),
    };
    await controller.discordCallback(query, request, jsonResponse);
    expect(jsonResponse.send).toHaveBeenCalledWith({ data: withoutReturnUrl });
    expect(jsonResponse.redirect).not.toHaveBeenCalled();
  });

  it('routes external auth, provider identities, link tokens, and action-token requests', async () => {
    const service = createService();
    const externalAuth = createExternalAuthService();
    const controller = toController(service, externalAuth);
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      roles: ['user'],
      permissions: ['profile:read'],
    };

    const tmaFixture = createRequest();
    await expect(controller.telegramTma({ initData: 'signed-init-data' }, tmaFixture.request)).resolves.toMatchObject({
      data: { status: 'authenticated' },
    });
    expect(externalAuth.telegramTma).toHaveBeenCalledWith(
      expect.objectContaining({ betterAuthProviderSubject: '777', principal: null }),
    );

    const oidcSession = {
      requireTelegramProfile: vi.fn(() =>
        Promise.resolve({
          avatarUrl: 'https://cdn.example.test/ada.png',
          displayName: 'Ada Lovelace',
          providerSubject: '777',
        }),
      ),
    };
    const oidcController = toController(service, externalAuth, oidcSession);
    const oidcFixture = createRequest();
    oidcFixture.request.headers = { cookie: 'better-auth.session_token=signed-session' };
    await expect(oidcController.telegramOidcSession({}, oidcFixture.request)).resolves.toMatchObject({
      data: { status: 'authenticated' },
    });
    expect(oidcSession.requireTelegramProfile).toHaveBeenCalledWith(oidcFixture.request.headers);
    expect(externalAuth.telegramOidcSession).toHaveBeenCalledWith({
      principal: null,
      profile: {
        avatarUrl: 'https://cdn.example.test/ada.png',
        displayName: 'Ada Lovelace',
        providerSubject: '777',
      },
    });

    await expect(
      controller.telegramBotLink({
        linkToken: 'link-token',
        providerSubject: 'telegram-subject',
      }),
    ).resolves.toMatchObject({ data: { status: 'linked' } });

    expect(
      controller.discordAuthorizationRequest(
        { returnUrl: 'https://app.example.test/after' },
        createRequest(principal).request,
      ),
    ).toEqual({
      data: {
        authorizationUrl: 'https://discord.example.test/oauth',
        stateExpiresAt: '2026-07-05T00:00:00.000Z',
      },
    });
    const authOnlyDiscordRequest = createRequest(principal).request;
    delete authOnlyDiscordRequest.user;
    expect(controller.discordAuthorizationRequest({}, authOnlyDiscordRequest)).toMatchObject({
      data: {
        authorizationUrl: 'https://discord.example.test/oauth',
      },
    });
    expect(controller.discordAuthorizationRequest({}, createRequest().request)).toMatchObject({
      data: {
        authorizationUrl: 'https://discord.example.test/oauth',
      },
    });

    await expect(controller.providerIdentities(principal)).resolves.toEqual({
      data: { items: [externalIdentity] },
    });
    await expect(controller.unlinkProviderIdentity(principal, 'identity-id')).resolves.toEqual({
      data: { unlinked: true },
    });
    await expect(
      controller.createLinkToken(principal, {
        provider: AuthProvider.Telegram,
      }),
    ).resolves.toMatchObject({ data: { token: 'link-token' } });
    expect(externalAuth.createLinkToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: DefaultAuthTenantId,
        userId: 'user-id',
      }),
    );

    await expect(controller.requestEmailVerification({ email: 'user@example.com' })).resolves.toEqual({
      data: { issued: true },
    });
    await expect(controller.requestPasswordReset({ email: 'user@example.com' })).resolves.toEqual({
      data: { issued: true },
    });
  });

  it('binds created link tokens to the caller tenant and ignores a body-supplied tenantId', async () => {
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      locale: 'ru',
      theme: AuthenticatedTheme.Dark,
      roles: ['user'],
      permissions: ['profile:read'],
    };
    const externalAuth = createExternalAuthService();
    const controller = toController(createService(), externalAuth);

    await controller.createLinkToken(principal, {
      provider: AuthProvider.Telegram,
      tenantId: '00000000-0000-4000-8000-000000000042',
    });

    expect(externalAuth.createLinkToken).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: DefaultAuthTenantId,
        userId: 'user-id',
      }),
    );
    expect(externalAuth.createLinkToken).not.toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: '00000000-0000-4000-8000-000000000042' }),
    );
  });

  it('clears the session principal and all response adapters on logout', async () => {
    process.env[SessionCookieName] = 'custom.sid';
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      locale: 'ru',
      theme: AuthenticatedTheme.Dark,
      roles: ['user'],
      permissions: ['profile:read'],
    };
    const response: AuthenticatedResponse = { clearCookie: vi.fn() };
    const { request, reply, rawResponse, session } = createRequest(principal, response);
    const controller = toController(createService());
    const passthroughResponse: AuthenticatedResponse = {
      clearCookie: vi.fn(),
    };

    await expect(controller.logout(request, passthroughResponse)).resolves.toEqual({
      data: { loggedOut: true },
    });

    expect(session.user).toBeUndefined();
    expect(request.user).toBeUndefined();
    expect(request.auth).toBeUndefined();
    expect(session.destroy).toHaveBeenCalledOnce();
    expect(response.clearCookie).toHaveBeenCalledWith('custom.sid', {
      path: '/',
    });
    expect(reply.clearCookie).toHaveBeenCalledWith('custom.sid', { path: '/' });
    expect(rawResponse.clearCookie).toHaveBeenCalledWith('custom.sid', {
      path: '/',
    });
    expect(passthroughResponse.clearCookie).toHaveBeenCalledWith('custom.sid', {
      path: '/',
    });
  });
});
