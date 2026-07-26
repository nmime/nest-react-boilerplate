// @requirements REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGeneratedEnvironment } from './environment.js';

describe('generated setup environment', () => {
  it('loads Compose profiles and bootstrap flags without shell evaluation', () => {
    assert.deepEqual(
      parseGeneratedEnvironment(
        '# generated\nCOMPOSE_PROFILES=admin-app,user-app\nOTEL_ENABLED=true\nOPENAPI_ENABLED=false\n',
      ),
      {
        COMPOSE_PROFILES: 'admin-app,user-app',
        OTEL_ENABLED: 'true',
        OPENAPI_ENABLED: 'false',
      },
    );
  });

  it('rejects malformed entries instead of silently changing the selection', () => {
    assert.throws(() => parseGeneratedEnvironment('COMPOSE_PROFILES\n'), /line 1/u);
    assert.throws(() => parseGeneratedEnvironment('bad-key=value\n'), /key/u);
  });
});
