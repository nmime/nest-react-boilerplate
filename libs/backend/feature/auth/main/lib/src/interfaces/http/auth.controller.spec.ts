import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthenticatedTheme,
  DefaultAuthTenantId,
  Language,
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type AuthenticatedResponse,
  type AuthenticatedSession,
  type AuthSessionView,
} from '@app/backend-feature-auth-shared';
import type { AuthService } from '../../application/auth.service';
import type { ExternalAuthService } from '../../application/external-auth.service';
import { AuthController, DiscordCallbackQueryDto, SessionCookieName } from './auth.controller';

type AuthControllerService = Pick<
  AuthService,
  | 'getUserById'
  | 'issueEmailVerificationToken'
  | 'issuePasswordResetToken'
  | 'login'
  | 'refreshSession'
  | 'register'
  | 'revokeRefreshToken'
  | 'updateUserPreferences'
>;

type ExternalAuthControllerService = Pick<
  ExternalAuthService,
  | 'createDiscordAuthorizationRequest'
  | 'createLinkToken'
  | 'discordCallback'
  | 'listProviderIdentities'
  | 'telegramBotLink'
  | 'telegramTma'
  | 'telegramWebLogin'
  | 'unlinkProviderIdentity'
>;

interface RequestFixture {
  request: AuthenticatedRequest;
  response: AuthenticatedResponse;
  reply: AuthenticatedResponse;
  rawResponse: AuthenticatedResponse;
  session: Required<Pick<AuthenticatedSession, 'destroy' | 'regenerate' | 'save'>> & Pick<AuthenticatedSession, 'user'>;
}

const sessionView: AuthSessionView = {
  user: {
    id: 'user-id',
    tenantId: DefaultAuthTenantId,
    email: 'user@example.com',
    displayName: 'Ada Lovelace',
    locale: Language.Ru,
    theme: AuthenticatedTheme.Dark,
    roles: ['user', 'admin'],
    permissions: ['profile:read', 'admin:profile:read'],
  },
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 3600,
};

function createService(
  overrides: Partial<{
    getUserById: AuthControllerService['getUserById'];
    issueEmailVerificationToken: AuthControllerService['issueEmailVerificationToken'];
    issuePasswordResetToken: AuthControllerService['issuePasswordResetToken'];
    login: AuthControllerService['login'];
    refreshSession: AuthControllerService['refreshSession'];
    register: AuthControllerService['register'];
    revokeRefreshToken: AuthControllerService['revokeRefreshToken'];
    updateUserPreferences: AuthControllerService['updateUserPreferences'];
  }> = {},
): AuthControllerService {
  return {
    register: vi.fn(() => Promise.resolve(sessionView)),
    login: vi.fn(() => Promise.resolve(sessionView)),
    refreshSession: vi.fn(() => Promise.resolve(sessionView)),
    revokeRefreshToken: vi.fn(() => Promise.resolve(true)),
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
    telegramWebLogin: vi.fn(() => Promise.resolve({ status: 'authenticated', session: sessionView })),
    telegramTma: vi.fn(() => Promise.resolve({ status: 'authenticated', session: sessionView })),
    telegramBotLink: vi.fn(() => Promise.resolve({ status: 'linked', identity: { id: 'telegram-id' } })),
    createDiscordAuthorizationRequest: vi.fn(() => ({
      authorizationUrl: 'https://discord.example.test/oauth',
      stateExpiresAt: '2026-07-05T00:00:00.000Z',
    })),
    discordCallback: vi.fn(() => Promise.resolve({ status: 'authenticated', session: sessionView })),
    listProviderIdentities: vi.fn(() => Promise.resolve([{ id: 'identity-id' }])),
    unlinkProviderIdentity: vi.fn(() => Promise.resolve({ unlinked: true })),
    createLinkToken: vi.fn(() =>
      Promise.resolve({
        token: 'link-token',
        expiresAt: '2026-07-05T00:00:00.000Z',
        provider: 'telegram',
        intent: 'link',
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
    regenerate: vi.fn((callback: (error?: unknown) => void) => {
      callback();
    }),
    save: vi.fn((callback: (error?: unknown) => void) => {
      callback();
    }),
    destroy: vi.fn((callback: (error?: unknown) => void) => {
      callback();
    }),
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
): AuthController {
  return new AuthController(service as AuthService, externalAuth as ExternalAuthService);
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
      data: { supportedLocales: ['en', 'ru'] },
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

  it('establishes the full session principal on login', async () => {
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
    expect(session.user).toEqual(expectedPrincipal);
    expect(request.user).toEqual(expectedPrincipal);
    expect(request.auth).toEqual(expectedPrincipal);
    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(session.save).toHaveBeenCalledOnce();
  });

  it('preserves token metadata when updating preferences', async () => {
    const updatedUser = {
      ...sessionView.user,
      displayName: 'Ada Byron',
      locale: Language.En,
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
      locale: Language.Ru,
      theme: AuthenticatedTheme.Dark,
      issuer: 'issuer',
      audience: ['web', 'mobile'],
      tokenId: 'token-id',
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
      issuer: 'issuer',
      audience: ['web', 'mobile'],
      tokenId: 'token-id',
      roles: ['user', 'admin'],
      permissions: ['profile:read', 'admin:profile:read'],
    });
    expect(request.user).toEqual(session.user);
    expect(request.auth).toEqual(session.user);
    expect(session.save).toHaveBeenCalledOnce();
  });

  it('updates locale and persists the refreshed principal', async () => {
    const updatedUser = {
      ...sessionView.user,
      locale: Language.Ru,
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
    const controller = new AuthController(createService() as AuthService, externalAuth);
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

  it('routes refresh, external auth, provider identities, link tokens, and action-token requests', async () => {
    const service = createService();
    const externalAuth = createExternalAuthService();
    const controller = toController(service, externalAuth);
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      roles: ['user'],
      permissions: ['profile:read'],
    };

    const refreshFixture = createRequest();
    await expect(controller.refresh({ refreshToken: 'refresh-token' }, refreshFixture.request)).resolves.toEqual({
      data: sessionView,
    });
    expect(service.refreshSession).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
    });
    expect(refreshFixture.session.regenerate).toHaveBeenCalledOnce();

    const webFixture = createRequest(principal);
    delete webFixture.request.user;
    await expect(
      controller.telegramWebLogin({ payload: { id: 1, hash: 'hash', auth_date: 1 } }, webFixture.request),
    ).resolves.toMatchObject({ data: { status: 'authenticated' } });
    expect(externalAuth.telegramWebLogin).toHaveBeenCalledWith(expect.objectContaining({ principal }));
    await expect(
      controller.telegramWebLogin({ payload: { id: 3, hash: 'hash', auth_date: 1 } }, createRequest().request),
    ).resolves.toMatchObject({ data: { status: 'authenticated' } });
    await expect(
      controller.telegramWebLogin({ payload: { id: 2, hash: 'hash', auth_date: 1 } }, createRequest(principal).request),
    ).resolves.toMatchObject({ data: { status: 'authenticated' } });

    const tmaFixture = createRequest();
    await expect(controller.telegramTma({ initData: 'signed-init-data' }, tmaFixture.request)).resolves.toMatchObject({
      data: { status: 'authenticated' },
    });
    expect(externalAuth.telegramTma).toHaveBeenCalledWith(expect.objectContaining({ principal: null }));

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
      data: [{ id: 'identity-id' }],
    });
    await expect(controller.unlinkProviderIdentity(principal, 'identity-id')).resolves.toEqual({
      data: { unlinked: true },
    });
    await expect(
      controller.createLinkToken(principal, {
        provider: 'telegram',
        tenantId: null,
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

  it('clears the session principal and all response adapters on logout', async () => {
    process.env[SessionCookieName] = 'custom.sid';
    const principal: AuthenticatedPrincipal = {
      subject: 'user-id',
      tenantId: DefaultAuthTenantId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      locale: Language.Ru,
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

  it('revokes a refresh token on logout when one is supplied', async () => {
    const service = createService();
    const controller = toController(service);
    const { request } = createRequest();

    await expect(controller.logout(request, {}, { refreshToken: 'refresh-token' })).resolves.toEqual({
      data: { loggedOut: true },
    });

    expect(service.revokeRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
    });
  });
});
