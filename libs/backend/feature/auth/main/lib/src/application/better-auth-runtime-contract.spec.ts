// @requirements REQ-AUTH-CREDENTIAL-003
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBetterAuthConfig } from './better-auth';
import { BetterAuthApiController } from './better-auth-api.controller';
import { BetterAuthInstanceToken } from './better-auth.module';

const baseUrl = 'http://localhost:3003';
const trustedOrigin = baseUrl;

describe('Better Auth delegated runtime contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const auth = getBetterAuthConfig(null, {
      secret: 'better-auth-runtime-contract-secret-0123456789',
      trustedOrigins: [trustedOrigin],
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
    ['POST', '/api/auth/sign-in/email', { email: 'nobody@example.test', password: 'invalid-password' }, 400],
    ['POST', '/api/auth/sign-out', {}, 200],
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

  it('rejects a state-changing request from an untrusted origin', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json' },
      payload: { email: 'nobody@example.test', password: 'invalid-password' },
    });

    expect(response.statusCode).toBe(403);
  });
});
