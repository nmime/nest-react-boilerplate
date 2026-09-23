// @requirements REQ-RUNTIME-HEALTH-001
import { describe, expect, it } from 'vitest';
import { detectRuntimeDetails, RuntimeHealthIndicator } from './runtime-health.indicator';

describe('RuntimeHealthIndicator', () => {
  it('reports Node with its actual version', () => {
    expect(detectRuntimeDetails({ node: '24.18.0' })).toEqual({ runtime: 'node', version: '24.18.0' });
  });

  it('reports the runtime identity through the health indicator', () => {
    const indicator = new RuntimeHealthIndicator({ node: '24.18.0' });

    expect(indicator.check({ appName: 'auth-app-api', kind: 'ready' })).toMatchObject({
      status: 'ok',
      details: {
        app: 'auth-app-api',
        runtime: 'node',
        version: '24.18.0',
      },
    });
  });
});
