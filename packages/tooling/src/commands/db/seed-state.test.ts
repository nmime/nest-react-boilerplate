// @requirements REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { recordSeedState } from './seed-state.js';

describe('database seed state marker', () => {
  it('records durable seeded state only after a successful seed call site invokes it', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-seed-state-'));
    try {
      recordSeedState('postgres', root);
      const content = readFileSync(join(root, '.nrb/seed-state.json'), 'utf8');
      assert.deepEqual(JSON.parse(content), {
        version: 1,
        provider: 'postgres',
        seeded: true,
      });
      assert.doesNotMatch(content, /postgres:\/\//u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
