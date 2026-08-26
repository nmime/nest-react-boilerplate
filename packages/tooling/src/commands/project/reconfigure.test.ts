// @requirements REQ-SCAFFOLD-INIT-004
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseReconfigureArgs } from './reconfigure.js';

describe('nrb reconfigure CLI', () => {
  it('accepts documented config/dry-run/force/json flags and Nx dryRun spelling', () => {
    assert.deepEqual(parseReconfigureArgs(['--config', 'custom.json', '--dry-run', '--force', '--json']), {
      config: 'custom.json',
      dryRun: true,
      force: true,
      json: true,
      help: false,
    });
    assert.equal(parseReconfigureArgs(['--dryRun']).dryRun, true);
  });

  it('rejects unknown flags', () => {
    assert.throws(() => parseReconfigureArgs(['--gate', 'auto']), /Unknown option/u);
  });
});
