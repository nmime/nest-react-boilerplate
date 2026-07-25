/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Fastify inject response JSON is intentionally dynamic in e2e tests. */
import { MikroORM } from '@mikro-orm/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Response as InjectResponse } from 'light-my-request';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createValidationPipe } from '@app/backend-common-validation';
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

describe('user-app-api health e2e', () => {
  let app: NestFastifyApplication | undefined;
  const ormMock = {
    close: vi.fn(() => Promise.resolve()),
    em: {
      fork: vi.fn(() => ormMock.em),
      getConnection: () => ({ execute: vi.fn(() => Promise.resolve()) }),
      getMigrator: () => ({
        getPendingMigrations: vi.fn(() => Promise.resolve([])),
      }),
      getRepository: () => ({}),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UserAppApiModule],
    })
      .overrideProvider(MikroORM)
      .useValue(ormMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
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
          name: 'postgres',
          status: 'ok',
          required: false,
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
            name: 'postgres',
            status: 'ok',
            required: false,
            details: expect.objectContaining({ skipped: false }),
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
