// @requirements REQ-RUNTIME-HEALTH-001
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { HealthTransformInterceptor } from './health-transform.interceptor';
import type { HealthResponse } from '../dto';

describe('HealthTransformInterceptor', () => {
  it('passes the health response through the stream unchanged', async () => {
    const interceptor = new HealthTransformInterceptor();
    const status = vi.fn();
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ExecutionContext;
    const response: HealthResponse = {
      status: 'ok',
      uptime: 42,
      timestamp: '2026-01-01T00:00:00.000Z',
      checks: [{ name: 'runtime', status: 'ok' }],
    };
    const next: CallHandler<HealthResponse> = {
      handle: () => of(response),
    };

    const result = await firstValueFrom(interceptor.intercept(context, next));

    expect(result).toBe(response);
    expect(status).toHaveBeenCalledWith(200);
  });

  it('sets HTTP 503 while preserving a failed readiness envelope', async () => {
    const status = vi.fn();
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ExecutionContext;
    const response = {
      data: {
        app: 'api',
        status: 'error' as const,
        dependencies: [{ name: 'postgres', status: 'error' as const, required: true }],
      },
    };

    const result = await firstValueFrom(
      new HealthTransformInterceptor().intercept(context, { handle: () => of(response) }),
    );

    expect(result).toBe(response);
    expect(status).toHaveBeenCalledWith(503);
  });
});
