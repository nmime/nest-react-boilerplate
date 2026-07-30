// @requirements REQ-AUTH-CREDENTIAL-003
import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Response as InjectResponse } from 'light-my-request';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ExceptionsFilter, ExceptionsResponseTransformer } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import type { AuthenticatedPrincipal, AuthenticatedSession } from '@app/backend-feature-auth-shared';

import { BetterAuthInstanceToken } from '@app/backend-feature-auth-main';
import { AuthAppApiModule } from './auth-app-api.module';
import { AuthAppApiCapabilitiesModule } from './capabilities.generated';

const mockAuth = {
  api: {},
  handler: async () => new Response('ok'),
} as any;

type UserThemePreference = 'system' | 'light' | 'dark';

interface HealthEnvelope {
  status?: string;
  checks?: unknown[];
  data?: {
    app?: string;
    status?: string;
    dependencies?: unknown[];
  };
}

interface AuthSessionResponse {
  data: {
    user: {
      email: string;
      locale?: string;
      theme: UserThemePreference;
    };
  };
}

const parseHealthEnvelope = (response: InjectResponse): HealthEnvelope => response.json<HealthEnvelope>();

const capabilityImports =
  (Reflect.getMetadata('imports', AuthAppApiCapabilitiesModule) as Array<{
    module?: { name?: string };
    name?: string;
  }> | null) ?? [];
const capabilityModuleNames = capabilityImports.map((entry) => entry.module?.name ?? entry.name ?? '');
let selectedPersistence: 'postgres' | 'mongodb' | 'memory' = 'memory';
if (capabilityModuleNames.some((name) => name.includes('Postgres'))) {
  selectedPersistence = 'postgres';
} else if (capabilityModuleNames.some((name) => name.includes('Mongo'))) {
  selectedPersistence = 'mongodb';
}

function readSessionId(cookieHeader: string | string[] | undefined): string | undefined {
  const header = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;

  return header
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('nrb.sid='))
    ?.slice('nrb.sid='.length);
}

function createSessionLifecycle(operation: () => void): NonNullable<AuthenticatedSession['destroy']> {
  function lifecycle(callback: (error?: unknown) => void): void;
  function lifecycle(): Promise<void>;
  function lifecycle(callback?: (error?: unknown) => void): void | Promise<void> {
    operation();
    if (callback) {
      callback();
      return;
    }
    return Promise.resolve();
  }

  return lifecycle;
}

function installInMemorySession(app: NestFastifyApplication): void {
  const sessions = new Map<string, AuthenticatedPrincipal>();
  const fastify = app.getHttpAdapter().getInstance() as {
    addHook: (
      hook: 'preHandler',
      handler: (
        request: { headers: { cookie?: string | string[] } },
        reply: { header: (name: string, value: string) => void },
        done: () => void,
      ) => void,
    ) => void;
  };

  fastify.addHook('preHandler', (request, reply, done) => {
    let sessionId = readSessionId(request.headers.cookie);
    const session: AuthenticatedSession = {
      ...(sessionId && sessions.has(sessionId) ? { user: sessions.get(sessionId) } : {}),
      destroy: createSessionLifecycle(() => {
        if (sessionId) {
          sessions.delete(sessionId);
        }
        delete session.user;
        reply.header('set-cookie', 'nrb.sid=; Path=/; Max-Age=0; HttpOnly');
      }),
      regenerate: createSessionLifecycle(() => {
        sessionId = randomUUID();
      }),
      save: createSessionLifecycle(() => {
        if (sessionId && session.user) {
          sessions.set(sessionId, session.user);
          reply.header('set-cookie', `nrb.sid=${sessionId}; Path=/; HttpOnly`);
        }
      }),
    };

    (request as { session?: AuthenticatedSession }).session = session;
    done();
  });
}

function sessionCookieHeader(response: Pick<InjectResponse, 'headers'>): string {
  const setCookie = response.headers['set-cookie'];
  let cookies: string[] = [];

  if (Array.isArray(setCookie)) {
    cookies = setCookie;
  } else if (typeof setCookie === 'string') {
    cookies = [setCookie];
  }

  return cookies
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie): cookie is string => cookie !== undefined && cookie.length > 0)
    .join('; ');
}

describe('auth-app-api e2e', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.AUTH_PERSISTENCE = selectedPersistence;
    process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
    process.env.MONGODB_DATABASE ??= 'test';
    process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/test';
    process.env.SESSION_SECRET = 'e2e-test-session-secret-at-least-32-characters';
    const moduleRef = await Test.createTestingModule({
      imports: [AuthAppApiModule],
    })
      .overrideProvider(BetterAuthInstanceToken)
      .useValue(mockAuth)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    installInMemorySession(app);
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalInterceptors(new ExceptionsResponseTransformer());
    app.useGlobalFilters(new ExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.getHttpAdapter().close();
    delete process.env.AUTH_PERSISTENCE;
    delete process.env.SESSION_SECRET;
  }, 30_000);

  it('GET / returns localized RFC 9457 problem details with an occurrence URI', async () => {
    const enResponse = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'accept-language': 'en', 'x-request-id': 'not-found-en' },
    });
    const ruResponse = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'accept-language': 'ru', 'x-request-id': 'not-found-ru' },
    });
    const enBody = enResponse.json<Record<string, unknown>>();
    const ruBody = ruResponse.json<Record<string, unknown>>();

    expect(enResponse.statusCode).toBe(404);
    expect(ruResponse.statusCode).toBe(404);
    expect(enResponse.headers['content-type']).toContain('application/problem+json');
    expect(enResponse.headers['content-language']).toBe('en');
    expect(ruResponse.headers['content-language']).toBe('ru');
    expect(enBody).toMatchObject({
      detail: 'The requested resource was not found.',
      instance: 'https://example.com/problem-instances/not-found-en',
      status: 404,
      title: 'Not Found',
      type: 'about:blank',
    });
    expect(ruBody).toMatchObject({
      detail: 'Запрашиваемый ресурс не найден.',
      instance: 'https://example.com/problem-instances/not-found-ru',
      status: enBody.status,
      title: 'Не найдено',
      type: enBody.type,
    });
  });

  it('GET /health returns shared liveness-compatible health details', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(parseHealthEnvelope(response)).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      checks: expect.arrayContaining([
        expect.objectContaining({ name: 'runtime', status: 'ok' }),
        expect.objectContaining({ name: 'config' }),
        expect.objectContaining({ name: 'i18n' }),
        expect.objectContaining({
          name: 'auth-persistence',
          status: 'ok',
          details: expect.objectContaining({ mode: selectedPersistence }),
        }),
      ]),
    });
  });

  it('uses only DB-backed cookie sessions for auth self endpoints', async () => {
    const password = `e2e-${Date.now().toString(36)}-secret`;
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'e2e@example.com',
        password,
        displayName: 'E2E User',
      }),
    });
    expect(register.statusCode).toBe(201);
    const registerBody = register.json<AuthSessionResponse>();
    let registerCookieHeader = sessionCookieHeader(register);
    expect(registerCookieHeader).toContain('nrb.sid=');
    expect(registerBody.data.user.email).toBe('e2e@example.com');
    expect(registerBody.data.user.theme).toBe('system');
    expect(registerBody.data).not.toHaveProperty('accessToken');
    expect(registerBody.data).not.toHaveProperty('refreshToken');

    const sessionOnlyMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: registerCookieHeader },
    });
    expect(sessionOnlyMe.statusCode).toBe(200);
    const sessionOnlyMeBody = sessionOnlyMe.json<{
      data?: {
        principal?: { email?: string; theme?: UserThemePreference };
        user?: { theme?: UserThemePreference };
      };
    }>();
    expect(sessionOnlyMeBody.data?.principal?.email).toBe('e2e@example.com');
    expect(sessionOnlyMeBody.data?.user?.theme).toBe('system');

    const bearerOnlyMe = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: 'Bearer header.payload.signature',
      },
    });
    expect(bearerOnlyMe.statusCode).toBe(401);

    const crossTenant = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        cookie: registerCookieHeader,
        'x-tenant-id': '22222222-2222-4222-8222-222222222222',
      },
    });
    expect(crossTenant.statusCode).toBe(401);

    const bearerOnlyPreferences = await app.inject({
      method: 'PATCH',
      url: '/auth/me/preferences',
      headers: {
        authorization: 'Bearer header.payload.signature',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ locale: 'ru', theme: 'dark' }),
    });
    expect(bearerOnlyPreferences.statusCode).toBe(401);

    const sessionOnlyPreferences = await app.inject({
      method: 'PATCH',
      url: '/auth/me/preferences',
      headers: {
        cookie: registerCookieHeader,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ locale: 'en', theme: 'light' }),
    });
    expect(sessionOnlyPreferences.statusCode).toBe(200);
    const preferencesCookieHeader = sessionCookieHeader(sessionOnlyPreferences);
    if (preferencesCookieHeader) {
      registerCookieHeader = preferencesCookieHeader;
    }
    const sessionOnlyPreferencesBody = sessionOnlyPreferences.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(sessionOnlyPreferencesBody.data?.locale).toBe('en');
    expect(sessionOnlyPreferencesBody.data?.theme).toBe('light');

    const bearerOnlyLocale = await app.inject({
      method: 'PATCH',
      url: '/auth/me/locale',
      headers: {
        authorization: 'Bearer header.payload.signature',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ locale: 'ru' }),
    });
    expect(bearerOnlyLocale.statusCode).toBe(401);

    const sessionOnlyLocale = await app.inject({
      method: 'PATCH',
      url: '/auth/me/locale',
      headers: {
        cookie: registerCookieHeader,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ locale: 'en' }),
    });
    expect(sessionOnlyLocale.statusCode).toBe(200);
    const localeCookieHeader = sessionCookieHeader(sessionOnlyLocale);
    if (localeCookieHeader) {
      registerCookieHeader = localeCookieHeader;
    }
    const sessionOnlyLocaleBody = sessionOnlyLocale.json<{
      data?: { locale?: string; theme?: UserThemePreference };
    }>();
    expect(sessionOnlyLocaleBody.data?.locale).toBe('en');
    expect(sessionOnlyLocaleBody.data?.theme).toBe('light');

    const invalidRegisterLocale = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'invalid-locale@example.com',
        password,
        locale: 'fr',
      }),
    });
    expect(invalidRegisterLocale.statusCode).toBe(400);

    const invalidLocale = await app.inject({
      method: 'PATCH',
      url: '/auth/me/locale',
      headers: {
        cookie: registerCookieHeader,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ locale: 'fr' }),
    });
    expect(invalidLocale.statusCode).toBe(400);

    const invalidTheme = await app.inject({
      method: 'PATCH',
      url: '/auth/me/preferences',
      headers: {
        cookie: registerCookieHeader,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ theme: 'sepia' }),
    });
    expect(invalidTheme.statusCode).toBe(400);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'e2e@example.com', password }),
    });
    expect(login.statusCode).toBe(200);
    expect(login.json<AuthSessionResponse>().data.user.email).toBe('e2e@example.com');

    const bearerOnlyLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: 'Bearer header.payload.signature',
      },
    });
    expect(bearerOnlyLogout.statusCode).toBe(401);

    const sessionOnlyLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: registerCookieHeader },
    });
    expect(sessionOnlyLogout.statusCode).toBe(201);
    expect(sessionOnlyLogout.json()).toEqual({ data: { loggedOut: true } });

    const sessionAfterLogout = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: registerCookieHeader },
    });
    expect(sessionAfterLogout.statusCode).toBe(401);
  });

  it('GET /live and /ready reflect the setup-selected persistence', async () => {
    const liveResponse = await app.inject({ method: 'GET', url: '/live' });
    expect(liveResponse.statusCode).toBe(200);
    expect(parseHealthEnvelope(liveResponse)).toMatchObject({
      data: {
        app: 'auth-app-api',
        status: expect.stringMatching(/^(ok|degraded)$/),
      },
    });

    const readyResponse = await app.inject({ method: 'GET', url: '/ready' });
    expect(readyResponse.statusCode).toBe(200);
    const readyBody = readyResponse.json<HealthEnvelope>();
    expect(readyBody.data?.app).toBe('auth-app-api');
    expect(readyBody.data?.status).toMatch(/^(ok|degraded)$/);
    const deps = readyBody.data?.dependencies as
      | Array<{
          name: string;
          status: string;
          required: boolean;
          details?: Record<string, unknown>;
        }>
      | undefined;
    expect(deps).toBeDefined();
    expect(deps!.find((d) => d.name === 'runtime')).toMatchObject({
      status: 'ok',
      required: true,
    });
    expect(deps!.find((d) => d.name === 'auth-persistence')).toMatchObject({
      status: 'ok',
      required: true,
      details: expect.objectContaining({ mode: selectedPersistence }),
    });
    expect(deps!.some((dependency) => dependency.name === 'database')).toBe(selectedPersistence !== 'memory');
    expect(deps!.find((d) => d.name === 'redis')).toMatchObject({
      status: 'ok',
      required: false,
    });
    expect(deps!.find((d) => d.name === 'nats')).toMatchObject({
      status: 'ok',
      required: false,
    });
  });
});
