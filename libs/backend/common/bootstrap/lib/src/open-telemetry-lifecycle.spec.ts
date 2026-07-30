// @requirements REQ-RUNTIME-LIFECYCLE-004
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shutdownOpenTelemetry: vi.fn(() => Promise.resolve()),
}));

vi.mock('@app/backend-common-otel', () => ({
  shutdownOpenTelemetry: mocks.shutdownOpenTelemetry,
}));

import { OpenTelemetryLifecycleProvider, withOpenTelemetryLifecycle } from './open-telemetry-lifecycle';

describe('OpenTelemetryLifecycleProvider', () => {
  it('wraps the product module without changing it', () => {
    class TestModule {}

    const wrapped = withOpenTelemetryLifecycle(TestModule);

    expect(wrapped.imports).toEqual([TestModule]);
    expect(wrapped.providers).toEqual([OpenTelemetryLifecycleProvider]);
  });

  it('registers and awaits OpenTelemetry shutdown when Nest closes', async () => {
    let releaseShutdown: (() => void) | undefined;
    mocks.shutdownOpenTelemetry.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseShutdown = resolve;
        }),
    );

    @Module({})
    class TestModule {}
    const app = await NestFactory.createApplicationContext(withOpenTelemetryLifecycle(TestModule), { logger: false });
    let closed = false;
    const close = app.close().then(() => {
      closed = true;
    });
    await vi.waitFor(() => {
      expect(mocks.shutdownOpenTelemetry).toHaveBeenCalledOnce();
    });

    expect(closed).toBe(false);
    releaseShutdown?.();
    await close;
    expect(closed).toBe(true);
  });
});
