/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Fastify inject response JSON is intentionally dynamic in e2e tests. */
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Response as InjectResponse } from 'light-my-request';
import { okAsync } from 'neverthrow';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ClsInterceptor,
  DurableDatabaseRuntimeInjectToken,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
import { ExceptionsFilter, ExceptionsResponseTransformer } from '@app/backend-common-response';
import { createValidationPipe } from '@app/backend-common-validation';
import { AdminProfileReadPermission } from '@app/backend-feature-admin-shared';
import { AuditLogAdminService } from '@app/backend-feature-audit-log-admin';
import {
  AuthUserRepositoryInjectToken,
  AuthUserRoleRepositoryInjectToken,
  DefaultAuthTenantId,
  type AuthenticatedRequest,
} from '@app/backend-feature-auth-shared';
import { AdminAppApiModule } from './admin-app-api.module';
import { AdminAppApiCapabilitiesModule } from './capabilities.generated';

interface HealthEnvelope {
  status?: string;
  checks?: unknown[];
  data?: {
    app?: string;
    status?: string;
    dependencies?: unknown[];
  };
  response?: {
    data?: {
      app?: string;
      dependencies?: unknown[];
    };
  };
  app?: string;
  dependencies?: unknown[];
}

const parseHealthEnvelope = (response: InjectResponse): HealthEnvelope => response.json<HealthEnvelope>();

const hasSelectedCapabilities =
  ((Reflect.getMetadata('imports', AdminAppApiCapabilitiesModule) as unknown[] | undefined) ?? []).length > 0;

describe.runIf(hasSelectedCapabilities && process.env.RUN_DATABASE_E2E === 'true')('admin-app-api health e2e', () => {
  let app: NestFastifyApplication;
  const authUsers = {
    findById: vi.fn(() => okAsync({ status: 'active' })),
  };
  const userRoles = {
    resolveEffectiveAccess: vi.fn(() =>
      okAsync({
        roleKeys: ['support'],
        permissionKeys: [AdminProfileReadPermission],
      }),
    ),
  };
  const audit = {
    record: vi.fn(() => Promise.resolve({})),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AdminAppApiModule],
    })
      .overrideProvider(AuthUserRepositoryInjectToken)
      .useValue(authUsers)
      .overrideProvider(AuthUserRoleRepositoryInjectToken)
      .useValue(userRoles)
      .overrideProvider(AuditLogAdminService)
      .useValue(audit)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, _reply, done) => {
        if (request.headers['x-test-admin-session'] !== 'active') {
          done();
          return;
        }
        (request as unknown as AuthenticatedRequest).session = {
          user: {
            subject: 'admin-id',
            tenantId: DefaultAuthTenantId,
            roles: ['admin'],
            permissions: ['admin:manage:all'],
          },
        };
        done();
      });
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    // `app` stays unset if `beforeAll` throws before assignment; guard so
    // teardown does not mask the original setup failure with a TypeError.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive teardown when setup failed before assignment
    await app?.close();
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
        expect.objectContaining({ name: 'database', status: 'ok' }),
        expect.objectContaining({ name: 'database-migrations', status: 'ok' }),
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
    });
  });

  it('exposes namespaced health aliases for the same-origin admin frontend', async () => {
    for (const url of ['/admin/health', '/admin/live', '/admin/ready']) {
      // eslint-disable-next-line no-await-in-loop -- aliases are verified independently in deterministic order
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(200);
    }
  });

  it('protects composed admin feature routes with the global authentication guard', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/profile/me' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a valid bearer credential at the session-only admin boundary', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/profile/me',
      headers: { authorization: 'Bearer header.payload.signature' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('uses PostgreSQL-effective permissions rather than stale cookie-session claims', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/profile/me',
      headers: { 'x-test-admin-session': 'active' },
    });
    const body = response.json<{ data: { principal: { roles: string[]; permissions: string[] } } }>();

    expect(response.statusCode).toBe(200);
    expect(authUsers.findById).toHaveBeenCalledWith('admin-id', DefaultAuthTenantId);
    expect(userRoles.resolveEffectiveAccess).toHaveBeenCalledWith('admin-id', DefaultAuthTenantId);
    expect(body.data.principal).toMatchObject({
      roles: ['support'],
      permissions: [AdminProfileReadPermission],
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: DefaultAuthTenantId, resource: 'admin.profile' }),
    );
  });

  it('GET /live and /ready return shared envelopes with dependencies', async () => {
    const liveResponse = await app.inject({ method: 'GET', url: '/live' });
    expect(liveResponse.statusCode).toBe(200);
    expect(parseHealthEnvelope(liveResponse)).toMatchObject({
      data: {
        app: 'admin-app-api',
        status: expect.stringMatching(/^(ok|degraded)$/),
        dependencies: expect.arrayContaining([expect.objectContaining({ name: 'runtime', status: 'ok' })]),
      },
    });

    const readyResponse = await app.inject({ method: 'GET', url: '/ready' });
    expect(readyResponse.statusCode).toBe(200);
    expect(parseHealthEnvelope(readyResponse)).toMatchObject({
      data: {
        app: 'admin-app-api',
        dependencies: expect.arrayContaining([
          expect.objectContaining({ name: 'database', status: 'ok' }),
          expect.objectContaining({
            name: 'database-migrations',
            status: 'ok',
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
        status: expect.stringMatching(/^(ok|degraded)$/),
      },
    });
  });

  it('GET /ready returns 503 with safe details for mandatory database failure', async () => {
    const leakedCredential = ['super', 'secret'].join('-');
    const leakedDatabaseUrl = ['postgres:/', `/user:${leakedCredential}@db:5432/app`].join('');
    const failingDatabaseRuntime: DurableDatabaseRuntime = {
      provider: 'postgres',
      healthIndicators: [
        {
          name: 'postgres',
          required: true,
          check: () => Promise.reject(new Error(`password=${leakedCredential} ${leakedDatabaseUrl}`)),
        },
      ],
      createSessionStore: () => {
        throw new Error('Session storage is not used by health tests.');
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [AdminAppApiModule],
    })
      .overrideProvider(DurableDatabaseRuntimeInjectToken)
      .useValue(failingDatabaseRuntime)
      .compile();
    const failingApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    try {
      // Mirror the production bootstrap boundary: readiness failures must keep
      // their health envelope even with the global RFC 9457 filter installed.
      failingApp.useGlobalInterceptors(new ClsInterceptor(), new ExceptionsResponseTransformer());
      failingApp.useGlobalFilters(new ExceptionsFilter());
      await failingApp.init();
      const response = await failingApp.inject({
        method: 'GET',
        url: '/ready',
      });
      const body = parseHealthEnvelope(response);

      expect(response.statusCode).toBe(503);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-type']).not.toContain('application/problem+json');
      expect(JSON.stringify(body)).not.toContain(leakedCredential);
      const errorPayload = body.data;
      expect(body.response).toBeUndefined();
      expect(errorPayload?.app).toBe('admin-app-api');
      expect(errorPayload?.dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'database',
            status: 'error',
            detail: expect.not.stringContaining(leakedCredential),
            details: expect.objectContaining({
              message: expect.not.stringContaining(leakedCredential),
            }),
          }),
        ]),
      );
    } finally {
      await failingApp.close();
    }
  });
});
