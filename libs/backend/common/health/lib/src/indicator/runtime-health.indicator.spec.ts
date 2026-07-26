// @requirements REQ-RUNTIME-HEALTH-001
import { describe, expect, it } from 'vitest';
import { detectRuntimeDetails, RuntimeHealthIndicator } from './runtime-health.indicator';

describe('RuntimeHealthIndicator', () => {
  it('reports Node with its actual version', () => {
    expect(detectRuntimeDetails({ node: '24.18.0' })).toEqual({ runtime: 'node', version: '24.18.0' });
  });

  it('reports Bun instead of its Node compatibility version', () => {
    const indicator = new RuntimeHealthIndicator({ bun: '1.3.14', node: '24.3.0' });

    expect(indicator.check({ appName: 'auth-app-api', kind: 'ready' })).toMatchObject({
      status: 'ok',
      details: {
        app: 'auth-app-api',
        runtime: 'bun',
        version: '1.3.14',
      },
    });
  });
});
