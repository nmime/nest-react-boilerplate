/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Fastify inject response JSON is intentionally dynamic in e2e tests. */
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Response as InjectResponse } from 'light-my-request';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createValidationPipe } from '@app/backend-common-validation';
import { UserAppApiCapabilitiesModule } from './capabilities.generated';
import { UserAppApiModule } from './user-app-api.module';

interface HealthEnvelope {
  status?: string;
  checks?: unknown[];
  data?: {
    app?: string;
    status?: string;
    dependencies?: unknown[];
  };
}

const parseHealthEnvelope = (response: InjectResponse): HealthEnvelope => response.json<HealthEnvelope>();

const hasSelectedCapabilities =
  ((Reflect.getMetadata('imports', UserAppApiCapabilitiesModule) as unknown[] | undefined) ?? []).length > 0;

describe.runIf(hasSelectedCapabilities)('user-app-api health e2e', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
    process.env.MONGODB_DATABASE ??= 'test';
    process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/test';
    const moduleRef = await Test.createTestingModule({
      imports: [UserAppApiModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
        expect.objectContaining({ name: 'session-config' }),
        expect.objectContaining({
          name: 'database',
          status: 'ok',
          required: true,
        }),
      ]),
    });
  });

  it('GET /live and /ready report the database-backed user API', async () => {
    const liveResponse = await app.inject({ method: 'GET', url: '/live' });
    expect(liveResponse.statusCode).toBe(200);
    expect(parseHealthEnvelope(liveResponse)).toMatchObject({
      data: {
        app: 'user-app-api',
        status: expect.stringMatching(/^(ok|degraded)$/),
      },
    });

    const readyResponse = await app.inject({ method: 'GET', url: '/ready' });
    expect(readyResponse.statusCode).toBe(200);
    expect(parseHealthEnvelope(readyResponse)).toMatchObject({
      data: {
        app: 'user-app-api',
        status: expect.stringMatching(/^(ok|degraded)$/),
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            name: 'database',
            status: 'ok',
            required: true,
            details: expect.objectContaining({ skipped: expect.any(Boolean) }),
          }),
          expect.objectContaining({
            name: 'database-migrations',
            required: false,
          }),
          expect.objectContaining({
            name: 'redis',
            status: 'ok',
            required: false,
          }),
          expect.objectContaining({
            name: 'nats',
            status: 'ok',
            required: false,
          }),
        ]),
      },
    });
  });
});
