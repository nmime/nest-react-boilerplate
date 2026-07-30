// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { fullCoverage, workspaceCoverageDirectory } from './vitest-coverage.mts';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');

void test('resolves coverage reports from the workspace root', () => {
  const directory = workspaceCoverageDirectory('coverage/libs/example');

  assert.equal(directory, resolve(workspaceRoot, 'coverage/libs/example'));
  assert.equal(fullCoverage('coverage/libs/example', ['src/**/*.ts']).reportsDirectory, directory);
});

void test('rejects ambiguous or escaping coverage report paths', () => {
  assert.throws(() => workspaceCoverageDirectory('../../coverage/libs/example'), /workspace-relative/);
  assert.throws(() => workspaceCoverageDirectory('dist/coverage/libs/example'), /workspace-relative/);
  assert.throws(() => workspaceCoverageDirectory('coverage/../outside'), /escapes/);
  assert.throws(
    () => workspaceCoverageDirectory(resolve(workspaceRoot, 'coverage/libs/example')),
    /workspace-relative/,
  );
});
