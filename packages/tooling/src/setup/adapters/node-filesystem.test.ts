// @requirements REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createNodeFilesystem } from './node-filesystem.js';

describe('node filesystem adapter', () => {
  it('preserves executable permissions across atomic replacements', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-node-fs-'));
    const path = join(root, 'script.sh');
    try {
      writeFileSync(path, '#!/bin/sh\necho before\n', { mode: 0o755 });
      await createNodeFilesystem(root).write('script.sh', '#!/bin/sh\necho after\n');

      assert.equal(readFileSync(path, 'utf8'), '#!/bin/sh\necho after\n');
      assert.equal(statSync(path).mode & 0o777, 0o755);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
