// @requirements REQ-AUTH-IDENTITY-005
import 'reflect-metadata';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExceptionsFilter } from '@app/backend-common-response';
import { AuthProvider, DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { AuthService } from '../../application/auth.service';
import { ExternalAuthService } from '../../application/external-auth.service';
import { AuthUserStoreInjectToken, InMemoryAuthUserStore } from '../../infrastructure/auth-user-store';
import { InMemorySocialAuthStore } from '../../infrastructure/social-auth-store';
import {
  TelegramBotAuthBridgeController,
  TelegramBotAuthBridgeGuard,
  TelegramBotAuthBridgeService,
} from './telegram-bot-auth-bridge.controller';

const serviceCredential = 'owned-telegram-bridge-fixture-credential-32-characters';
const secondTenant = '11111111-1111-4111-8111-111111111111';

describe('Telegram stateless auth HTTP bridge', () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  async function fixture(enabled = true) {
    vi.stubEnv('TELEGRAM_BOT_AUTH_SECRET', enabled ? serviceCredential : '');
    vi.stubEnv('TELEGRAM_BOT_AUTH_TENANT_ID', '');
    vi.stubEnv('AUTH_TELEGRAM_ENABLED', 'true');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:owned-bridge-fixture');
    const users = new InMemoryAuthUserStore();
    const social = new InMemorySocialAuthStore();
    const auth = new AuthService(users, undefined, social);
    const external = new ExternalAuthService(auth, users, social);
    const module = await Test.createTestingModule({
      controllers: [TelegramBotAuthBridgeController],
      providers: [
        TelegramBotAuthBridgeService,
        TelegramBotAuthBridgeGuard,
        { provide: AuthUserStoreInjectToken, useValue: users },
        { provide: ExternalAuthService, useValue: external },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    app.useGlobalFilters(new ExceptionsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const request = (action: string, payload: Record<string, unknown>, credential: string | null = serviceCredential) =>
      app!.inject({
        method: 'POST',
        url: `/auth/internal/telegram-bot/${action}`,
        payload,
        headers: {
          ...(credential ? { authorization: `Bearer ${credential}` } : {}),
          cookie: 'nrb.sid=browser-cookie-is-not-service-authority',
        },
      });
    return { auth, external, social, users, request };
  }

  it.each([true, false])(
    'rejects browser cookies and invalid service credentials before identity reads (enabled=%s)',
    async (enabled) => {
      const { external, request } = await fixture(enabled);
      const lookup = vi.spyOn(external, 'resolveProviderPrincipal');
      for (const credential of [null, 'wrong-credential', ...(enabled ? [] : [serviceCredential])]) {
        const result = await request('resolve', { providerSubject: '100' }, credential);
        expect(result.statusCode).toBe(401);
        expect(result.headers['content-type']).toContain('application/problem+json');
        expect(result.body).not.toContain(serviceCredential);
      }
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it('links once, returns the stored local UUID only, re-resolves locale ownership and reflects unlink/disable', async () => {
    const { auth, external, social, users, request } = await fixture();
    const account = await auth.register({ email: 'bridge@example.test', password: 'password123' });
    const token = await external.createLinkToken({ userId: account.user.id, provider: AuthProvider.Telegram });
    const unknown = await request('resolve', { providerSubject: '100' });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).toBe('null');
    const linked = await request('link', { providerSubject: '100', linkToken: token.token });
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toEqual({ userId: account.user.id, tenantId: DefaultAuthTenantId, locale: null });
    expect(linked.body).not.toMatch(/session|passwordHash|permissions|credential|linkToken/u);
    expect((await request('link', { providerSubject: '100', linkToken: token.token })).statusCode).toBe(401);
    const locale = await request('locale', { providerSubject: '100', locale: 'zh' });
    expect(locale.statusCode).toBe(200);
    expect(locale.json().locale).toBe('zh');
    expect((await users.findById(account.user.id))._unsafeUnwrap()?.locale).toBe('zh');
    expect(
      (await request('locale', { providerSubject: '100', locale: 'en', userId: 'attacker', tenantId: secondTenant }))
        .statusCode,
    ).toBe(400);
    const record = (await users.findById(account.user.id))._unsafeUnwrap()!;
    record.status = 'disabled';
    expect((await request('resolve', { providerSubject: '100' })).body).toBe('null');
    expect((await request('locale', { providerSubject: '100', locale: 'en' })).statusCode).toBe(401);
    record.status = 'active';
    const identity = (await social.findIdentity(AuthProvider.Telegram, '100', DefaultAuthTenantId))._unsafeUnwrap()!;
    await social.deleteIdentity(identity.id, account.user.id, DefaultAuthTenantId);
    expect((await request('resolve', { providerSubject: '100' })).body).toBe('null');
  });

  it('refuses a token from another tenant before creating an identity', async () => {
    const { external, social, users, request } = await fixture();
    const owner = (
      await users.create({
        tenantId: secondTenant,
        email: null,
        passwordHash: 'unused',
        roles: ['user'],
        permissions: [],
      })
    )._unsafeUnwrap();
    const token = await external.createLinkToken({
      tenantId: secondTenant,
      userId: owner.id,
      provider: AuthProvider.Telegram,
    });
    expect((await request('link', { providerSubject: '200', linkToken: token.token })).statusCode).toBe(401);
    expect((await social.findIdentity(AuthProvider.Telegram, '200', secondTenant))._unsafeUnwrap()).toBeNull();
    expect((await social.findIdentity(AuthProvider.Telegram, '200', DefaultAuthTenantId))._unsafeUnwrap()).toBeNull();
  });

  it('validates provider subjects, opaque tokens and supported locales at the actual HTTP boundary', async () => {
    const { request } = await fixture();
    for (const [action, payload] of [
      ['resolve', { providerSubject: 'local-uuid' }],
      ['resolve', { providerSubject: 100 }],
      ['link', { providerSubject: '100', linkToken: 'guess' }],
      ['locale', { providerSubject: '100', locale: 'unsupported' }],
    ] as const) {
      expect((await request(action, payload)).statusCode).toBe(400);
    }
  });

  it('refuses malformed or tenant-only bridge configuration', () => {
    const users = new InMemoryAuthUserStore();
    const auth = new AuthService(users);
    const external = new ExternalAuthService(auth, users, new InMemorySocialAuthStore());
    vi.stubEnv('TELEGRAM_BOT_AUTH_SECRET', 'too-short');
    expect(() => new TelegramBotAuthBridgeService(external, users)).toThrow('dedicated');
    vi.stubEnv('TELEGRAM_BOT_AUTH_SECRET', serviceCredential);
    vi.stubEnv('TELEGRAM_BOT_AUTH_TENANT_ID', 'not-a-tenant');
    expect(() => new TelegramBotAuthBridgeService(external, users)).toThrow('UUID');
    vi.stubEnv('TELEGRAM_BOT_AUTH_SECRET', '');
    expect(() => new TelegramBotAuthBridgeService(external, users)).toThrow('dedicated');
  });
});
