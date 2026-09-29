// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectJavaScriptRuntime } from './environment.ts';

void describe('JavaScript runtime detection', () => {
  void it('reports Node from the process version', () => {
    assert.deepEqual(detectJavaScriptRuntime('v24.21.0'), {
      name: 'node',
      version: '24.21.0',
    });
  });
});
