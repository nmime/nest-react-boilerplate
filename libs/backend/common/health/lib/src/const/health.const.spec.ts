// @requirements REQ-RUNTIME-HEALTH-001
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HealthHttpStatus } from './health.const';

describe('HealthHttpStatus', () => {
  it('maps success-tolerant statuses to HTTP 200 and errors to 503', () => {
    expect(HealthHttpStatus).toEqual({
      ok: HttpStatus.OK,
      degraded: HttpStatus.OK,
      error: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(HealthHttpStatus.ok).toBe(200);
    expect(HealthHttpStatus.degraded).toBe(200);
    expect(HealthHttpStatus.error).toBe(503);
  });
});
