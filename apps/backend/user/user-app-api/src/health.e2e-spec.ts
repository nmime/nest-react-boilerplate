// @requirements REQ-AUTH-PROFILE-006
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Fastify inject response JSON is intentionally dynamic in e2e tests. */
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Response as InjectResponse } from 'light-my-request';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DurableDatabaseRuntimeInjectToken,
  type DurableDatabaseProviderId,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
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

const capabilityImports =
  (Reflect.getMetadata('imports', UserAppApiCapabilitiesModule) as Array<{
    module?: { name?: string };
    name?: string;
  }> | null) ?? [];
const capabilityModuleNames = capabilityImports.map((entry) => entry.module?.name ?? entry.name ?? '');
let selectedDatabaseProvider: DurableDatabaseProviderId | undefined;
if (capabilityModuleNames.some((name) => name.includes('Postgres'))) {
  selectedDatabaseProvider = 'postgres';
} else if (capabilityModuleNames.some((name) => name.includes('Mongo'))) {
  selectedDatabaseProvider = 'mongodb';
}

const runDatabaseE2e = selectedDatabaseProvider !== undefined && process.env.RUN_DATABASE_E2E === 'true';

describe.runIf(runDatabaseE2e)('user-app-api health e2e', () => {
  let app: NestFastifyApplication | undefined;

  beforeAll(async () => {
    process.env.AUTH_PERSISTENCE = selectedDatabaseProvider;
    process.env.DATABASE_ENGINE = selectedDatabaseProvider;
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
    // `app` stays unset if `beforeAll` throws before assignment; guard so
    // teardown does not mask the original setup failure with a TypeError.
    await app?.close();
    delete process.env.AUTH_PERSISTENCE;
    delete process.env.DATABASE_ENGINE;
  });

  it('GET /health returns shared liveness-compatible health details', async () => {
    if (!app) {
      throw new Error('Test application was not initialized');
    }
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
    if (!app) {
      throw new Error('Test application was not initialized');
    }
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

  it('GET /ready fails safely when the selected durable database is unavailable', async () => {
    const sensitiveValue = ['sensitive', 'health', 'fixture'].join('-');
    const failingDatabaseRuntime: DurableDatabaseRuntime = {
      provider: selectedDatabaseProvider ?? 'postgres',
      healthIndicators: [
        {
          name: selectedDatabaseProvider ?? 'database',
          required: true,
          check: () => Promise.reject(new Error(`password=${sensitiveValue}`)),
        },
      ],
      createSessionStore: () => {
        throw new Error('Session storage is not used by health tests.');
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [UserAppApiModule],
    })
      .overrideProvider(DurableDatabaseRuntimeInjectToken)
      .useValue(failingDatabaseRuntime)
      .compile();
    const failingApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    try {
      await failingApp.init();
      const response = await failingApp.inject({ method: 'GET', url: '/ready' });
      const body = parseHealthEnvelope(response);

      expect(response.statusCode).toBe(503);
      expect(body.data).toMatchObject({
        app: 'user-app-api',
        status: 'error',
        dependencies: expect.arrayContaining([
          expect.objectContaining({
            name: 'database',
            status: 'error',
            required: true,
            detail: expect.not.stringContaining(sensitiveValue),
            details: expect.objectContaining({
              message: expect.not.stringContaining(sensitiveValue),
            }),
          }),
        ]),
      });
      expect(JSON.stringify(body)).not.toContain(sensitiveValue);
    } finally {
      await failingApp.close();
    }
  });
});
