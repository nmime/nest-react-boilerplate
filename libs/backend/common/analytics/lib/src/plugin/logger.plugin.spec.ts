// @requirements REQ-RUNTIME-OBSERVABILITY-005
import type { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { createLoggerAnalyticsPlugin } from './logger.plugin';

function fakeLogger(): { logger: Logger; debug: ReturnType<typeof vi.fn> } {
  const debug = vi.fn();
  return { logger: { debug } as unknown as Logger, debug };
}

describe('createLoggerAnalyticsPlugin', () => {
  it('logs track payloads as structured debug output', async () => {
    const { logger, debug } = fakeLogger();
    const plugin = createLoggerAnalyticsPlugin(logger);
    const timestamp = new Date('2024-01-02T03:04:05.000Z');

    await plugin.track?.({ event: 'order_created', timestamp });

    expect(debug).toHaveBeenCalledTimes(1);
    expect(JSON.parse(debug.mock.calls[0]?.[0] as string)).toEqual({
      type: 'track',
      payload: { event: 'order_created', timestamp: timestamp.toISOString() },
    });
  });

  it('logs identify payloads as structured debug output', async () => {
    const { logger, debug } = fakeLogger();
    const plugin = createLoggerAnalyticsPlugin(logger);

    await plugin.identify?.({ userId: 'user-1', traits: { plan: 'pro' } });

    expect(JSON.parse(debug.mock.calls[0]?.[0] as string)).toEqual({
      type: 'identify',
      payload: { userId: 'user-1', traits: { plan: 'pro' } },
    });
  });

  it('logs page payloads as structured debug output', async () => {
    const { logger, debug } = fakeLogger();
    const plugin = createLoggerAnalyticsPlugin(logger);

    await plugin.page?.({ name: 'Home', path: '/' });

    expect(JSON.parse(debug.mock.calls[0]?.[0] as string)).toEqual({
      type: 'page',
      payload: { name: 'Home', path: '/' },
    });
  });
});
