import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectJavaScriptRuntime } from './environment.ts';

void describe('JavaScript runtime detection', () => {
  void it('reports Node from the process version', () => {
    assert.deepEqual(detectJavaScriptRuntime({ node: '24.18.0' }, 'v24.18.0'), {
      name: 'node',
      version: '24.18.0',
    });
  });

  void it('prioritizes Bun and retains its Node compatibility version', () => {
    assert.deepEqual(detectJavaScriptRuntime({ bun: '1.3.14', node: '24.3.0' }, 'v24.3.0'), {
      name: 'bun',
      version: '1.3.14',
      nodeCompatibilityVersion: '24.3.0',
    });
  });
});
