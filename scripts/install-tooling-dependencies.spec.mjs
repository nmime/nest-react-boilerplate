import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { removeWorkspaceDependencyTrees } from './install-tooling-dependencies.mjs';

test('explicit tooling install cleanup removes root and nested selected dependency links', () => {
  const root = mkdtempSync(join(tmpdir(), 'nrb-tooling-install-'));
  try {
    for (const path of ['node_modules', 'apps/frontend/site/node_modules', 'packages/tooling/node_modules']) {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, 'marker'), 'stale');
    }
    removeWorkspaceDependencyTrees(root);
    assert.equal(existsSync(join(root, 'node_modules')), false);
    assert.equal(existsSync(join(root, 'apps/frontend/site/node_modules')), false);
    assert.equal(existsSync(join(root, 'packages/tooling/node_modules')), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
