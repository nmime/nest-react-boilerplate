// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseReconfigureArgs } from './reconfigure.js';

describe('nrb reconfigure CLI', () => {
  it('accepts config, gate, audit, dry-run, force, JSON, and Nx dryRun spelling', () => {
    assert.deepEqual(
      parseReconfigureArgs(['--config', 'custom.json', '--gate', 'off', '--force', '--json']),
      {
        config: 'custom.json',
        gate: 'off',
        audit: false,
        dryRun: false,
        force: true,
        json: true,
        help: false,
      },
    );
    assert.equal(parseReconfigureArgs(['--dryRun']).dryRun, true);
    assert.equal(parseReconfigureArgs(['--audit']).audit, true);
    assert.equal(parseReconfigureArgs(['--gate=auto']).gate, 'auto');
  });

  it('rejects unknown gate modes and incompatible audit/dry-run flags', () => {
    assert.throws(() => parseReconfigureArgs(['--gate', 'always']), /auto or off/u);
    assert.throws(() => parseReconfigureArgs(['--audit', '--dry-run']), /cannot be combined/u);
  });
});
