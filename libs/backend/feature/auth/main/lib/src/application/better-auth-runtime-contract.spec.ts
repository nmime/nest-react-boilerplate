// @requirements REQ-AUTH-CREDENTIAL-003
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBetterAuthConfig } from './better-auth';
import { BetterAuthApiController } from './better-auth-api.controller';
import { BetterAuthInstanceToken } from './better-auth.module';

/**
 * Runtime contract for the delegated `/api/auth/*` surface: `BetterAuthApiController`
 * is a static catch-all that forwards every child path to the Better Auth handler, so
 * this spec pins what the *handler* actually does at the public boundary.
 *
 * The config re-enables Better Auth's origin check (`disableOriginCheck: false`)
 * because Better Auth silently skips it whenever NODE_ENV is `test`; the
 * production default is check-on, and that is the behavior the release relies on.
 *
 * Two independent CSRF mechanisms are pinned here:
 * 1. Origin check — state-changing requests that carry a session cookie must come
 *    from a trusted origin (403 INVALID_ORIGIN / MISSING_OR_NULL_ORIGIN).
 * 2. Fetch-metadata gate — cookie-less cross-site navigation login attempts
 *    (sec-fetch-site: cross-site + sec-fetch-mode: navigate) are blocked with 403
 *    before the endpoint body runs. The 403 is proven against a 400 control
 *    request so the gate, not endpoint availability, is what is asserted.
 *
 * This runtime has no email/password provider (social auth only), so
 * `/sign-in/email` and `/sign-up/email` answer 400 EMAIL_PASSWORD_DISABLED —
 * that refusal is pinned as the expected public behavior for those child routes.
 */
const baseUrl = 'http://localhost:3003';
const trustedOrigin = baseUrl;
const untrustedOrigin = 'https://attacker.example';
const victimSessionCookie = 'better-auth.session_token=victim-session';

describe('Better Auth delegated runtime contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const auth = getBetterAuthConfig(null, {
      secret: 'better-auth-runtime-contract-secret-0123456789',
      trustedOrigins: [trustedOrigin],
      advanced: { disableOriginCheck: false },
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [BetterAuthApiController],
      providers: [{ provide: BetterAuthInstanceToken, useValue: auth }],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/auth/get-session', undefined, 200],
    ['POST', '/api/auth/sign-out', {}, 200],
    ['POST', '/api/auth/sign-in/email', { email: 'nobody@example.test', password: 'invalid-password' }, 400],
    ['POST', '/api/auth/request-password-reset', { email: 'nobody@example.test' }, 400],
    ['GET', '/api/auth/verify-email?token=invalid', undefined, 401],
  ] as const)('mounts %s %s through the public Better Auth handler', async (method, url, payload, status) => {
    const response = await app.inject({
      method,
      url,
      headers: { origin: trustedOrigin, 'content-type': 'application/json' },
      payload,
    });

    expect(response.statusCode).toBe(status);
  });

  it('returns 404 for an unknown delegated child route', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/not-a-real-route' });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a state-changing request that carries a session cookie from an untrusted origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: untrustedOrigin,
        cookie: victimSessionCookie,
        'content-type': 'application/json',
      },
      payload: { email: 'nobody@example.test', password: 'invalid-password' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
  });

  it('blocks a cross-site navigation login attempt at the CSRF gate', async () => {
    // Control first: the same JSON request without cross-site fetch metadata is
    // rejected at the endpoint itself (email/password is not enabled in this
    // runtime) with 400 — so the 403 below is the cross-site gate, not endpoint
    // availability. Better Auth's fetch-metadata gate (formCsrf) fires for
    // state-changing login attempts that arrive cross-site without a session.
    const control = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'nobody@example.test', password: 'invalid-password' },
    });
    expect(control.statusCode).toBe(400);

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'empty',
        'content-type': 'application/json',
      },
      payload: { email: 'nobody@example.test', password: 'invalid-password' },
    });

    expect(blocked.statusCode).toBe(403);
    // No session may be established or echoed by a blocked login attempt.
    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect(blocked.body).not.toContain('victim-session');
  });

  it('refuses a cross-site form-encoded login body without establishing a session', async () => {
    // The catch-all controller re-serializes request bodies as JSON while
    // keeping the declared content-type, so a real browser form body arrives at
    // Better Auth malformed and is rejected with 400 — the form path fails
    // closed in this runtime. Pin that shape: a cross-site form login attempt
    // must not get a session cookie either way.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'empty',
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'email=nobody%40example.test&password=invalid-password',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a state-changing social sign-in from an untrusted origin with a session cookie', async () => {
    // Social sign-in is the product's real authentication path; the origin gate
    // must protect it the same way as the delegated email path.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      headers: {
        origin: untrustedOrigin,
        cookie: victimSessionCookie,
        'content-type': 'application/json',
      },
      payload: { provider: 'telegram' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
  });

  it('lets a trusted-origin state-changing request pass the origin check to the endpoint', async () => {
    // The endpoint itself fails (email/password sign-in is not enabled in this
    // runtime), but the 400 — not a 403 — proves the trusted origin cleared the
    // CSRF gate instead of being rejected at it.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: trustedOrigin,
        cookie: victimSessionCookie,
        'content-type': 'application/json',
      },
      payload: { email: 'nobody@example.test', password: 'invalid-password' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code ?? '').not.toBe('INVALID_ORIGIN');
  });
});
