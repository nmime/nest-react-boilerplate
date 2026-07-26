// @requirements REQ-RUNTIME-HEALTH-001
// Evidence for: REQ-RUNTIME-HEALTH-001
import { describe, expect, it } from 'vitest';
// Domain health evidence for REQ-RUNTIME-HEALTH-001.
import { HealthService } from './health.service';
import { toHealthResponseDto } from './mapper';
import { hasRequiredReadinessFailure, resolveHealthStatus } from './util/health-status.util';
import { sanitizeHealthDetails } from './util/health-sanitize.util';
import type { HealthIndicatorResult, HealthResponse } from './dto';

describe('HealthService', () => {
  it('returns app-aware DTO envelopes preserving current API response contracts', async () => {
    const service = new HealthService({
      appName: 'admin-app-api',
      indicators: [
        {
          name: 'postgres',
          check: () => ({ name: 'postgres', status: 'ok' }),
        },
      ],
    });

    const response = await service.checkEnvelope('ready');

    expect(response.data).toMatchObject({
      app: 'admin-app-api',
      status: 'ok',
      dependencies: [{ name: 'postgres', status: 'ok', required: true }],
      checks: [{ name: 'postgres', status: 'ok', required: true }],
    });
    expect(typeof response.data.uptime).toBe('number');
    expect(new Date(response.data.timestamp ?? '').toString()).not.toBe('Invalid Date');
  });

  it('runs only liveness-safe indicators on the liveness path', async () => {
    let dependencyChecks = 0;
    let livenessChecks = 0;
    const service = new HealthService({
      appName: 'api',
      indicators: [
        {
          name: 'runtime',
          livenessSafe: true,
          check: () => {
            livenessChecks += 1;
            return { name: 'runtime', status: 'ok' };
          },
        },
        {
          name: 'postgres',
          check: () => {
            dependencyChecks += 1;
            return { name: 'postgres', status: 'ok' };
          },
        },
      ],
    });

    const liveness = await service.check('live');

    expect(liveness.status).toBe('ok');
    expect(liveness.checks).toHaveLength(1);
    expect(liveness.checks[0]).toMatchObject({
      name: 'runtime',
      status: 'ok',
      required: true,
    });
    expect(dependencyChecks).toBe(0);
    expect(livenessChecks).toBe(1);

    const readiness = await service.check('ready');

    expect(readiness.checks.map((check) => check.name)).toEqual(['runtime', 'postgres']);
    expect(dependencyChecks).toBe(1);
  });

  it('keeps liveness green when a dependency indicator would fail', async () => {
    const service = new HealthService({
      appName: 'api',
      indicators: [
        {
          name: 'runtime',
          livenessSafe: true,
          check: () => ({ name: 'runtime', status: 'ok' }),
        },
        {
          name: 'postgres',
          check: () => {
            throw new Error('connection refused');
          },
        },
      ],
    });

    await expect(service.checkLiveness()).resolves.toMatchObject({
      data: { app: 'api', status: 'ok', dependencies: [{ name: 'runtime' }] },
    });
    await expect(service.checkReadiness()).resolves.toMatchObject({
      data: { app: 'api', status: 'error' },
    });
  });

  it('aggregates required errors as error and optional errors as degraded', () => {
    expect(
      resolveHealthStatus([
        { name: 'runtime', status: 'ok' },
        { name: 'cache', status: 'error', required: false },
      ]),
    ).toBe('degraded');

    expect(
      resolveHealthStatus([
        { name: 'runtime', status: 'ok' },
        { name: 'postgres', status: 'error', required: true },
      ]),
    ).toBe('error');

    expect(
      resolveHealthStatus([
        { name: 'runtime', status: 'ok' },
        { name: 'i18n', status: 'skipped', required: false },
      ]),
    ).toBe('ok');
  });

  it('sanitizes unsafe details and raw indicator exceptions', async () => {
    const service = new HealthService({
      appName: 'api',
      indicators: [
        {
          name: 'unsafe',
          check: () => ({
            name: 'unsafe',
            status: 'degraded',
            details: {
              password: 'super-secret',
              nested: { accessToken: 'token-value', safe: 'visible' },
            },
          }),
        },
        {
          name: 'throws',
          check: () => {
            throw new Error('password=super-secret host=10.0.0.1');
          },
        },
      ],
    });

    const response = await service.check('ready');

    expect(response.checks[0]?.details).toEqual({
      password: '[redacted]',
      nested: { accessToken: '[redacted]', safe: 'visible' },
    });
    expect(response.checks[1]).toMatchObject({
      name: 'throws',
      status: 'error',
      details: { message: 'Health indicator failed.' },
    });
  });

  it('falls back to the indicator name when the result omits its own name', async () => {
    const service = new HealthService({
      appName: 'api',
      indicators: [
        {
          name: 'cache',
          check: () => ({ name: '', status: 'ok' }),
        },
      ],
    });

    const response = await service.check('ready');

    expect(response.checks[0]).toMatchObject({
      name: 'cache',
      status: 'ok',
    });
  });

  it('accepts a bare indicator list and defaults the app name', async () => {
    const service = new HealthService([
      {
        name: 'runtime',
        check: () => ({ name: 'runtime', status: 'ok' }),
      },
    ]);

    expect(service.appName).toBe('app');

    const response = await service.check('health');

    expect(response.status).toBe('ok');
    expect(response.checks).toMatchObject([{ name: 'runtime', status: 'ok', required: true }]);
  });

  it('defaults the app name and indicators when constructed without options', async () => {
    const service = new HealthService();

    expect(service.appName).toBe('app');
    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      checks: [],
    });
  });

  it('exposes readiness failure semantics only for mandatory error checks', () => {
    const optionalFailure: HealthResponse = {
      status: 'degraded',
      uptime: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      checks: [{ name: 'cache', status: 'error', required: false }],
    };
    const mandatoryFailure: HealthResponse = {
      ...optionalFailure,
      status: 'error',
      checks: [{ name: 'postgres', status: 'error', required: true }],
    };

    expect(hasRequiredReadinessFailure(optionalFailure)).toBe(false);
    expect(hasRequiredReadinessFailure(mandatoryFailure)).toBe(true);
  });

  it('treats an envelope without a checks array as having no readiness failure', () => {
    expect(
      hasRequiredReadinessFailure({
        data: { app: 'api', status: 'ok' },
      }),
    ).toBe(false);
  });

  it('maps raw health responses to DTO dependencies and checks', () => {
    const check: HealthIndicatorResult = {
      name: 'postgres',
      status: 'error',
      required: true,
      details: { message: 'PostgreSQL readiness check failed.' },
    };

    expect(
      toHealthResponseDto('user-app-api', {
        status: 'error',
        uptime: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        checks: [check],
      }),
    ).toEqual({
      data: {
        app: 'user-app-api',
        status: 'error',
        uptime: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        dependencies: [
          {
            name: 'postgres',
            status: 'error',
            detail: 'PostgreSQL readiness check failed.',
            details: { message: 'PostgreSQL readiness check failed.' },
            required: true,
          },
        ],
        checks: [check],
      },
    });
  });

  it('redacts health details by unsafe key without removing safe fields', () => {
    expect(
      sanitizeHealthDetails({
        safe: 'ok',
        apiSecret: 'secret',
        items: [{ privateKey: 'key', name: 'public' }],
      }),
    ).toEqual({
      safe: 'ok',
      apiSecret: '[redacted]',
      items: [{ privateKey: '[redacted]', name: 'public' }],
    });
  });
});
