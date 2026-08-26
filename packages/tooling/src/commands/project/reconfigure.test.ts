// @requirements REQ-SCAFFOLD-INIT-004 REQ-SCAFFOLD-GENERATORS-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseReconfigureArgs } from './reconfigure.js';
describe('nrb reconfigure CLI', () => {
  it('accepts gate and audit modes', () => {
    assert.deepEqual(parseReconfigureArgs(['--config','custom.json','--gate','off','--force','--json']), { config: 'custom.json', gate: 'off', audit: false, dryRun: false, force: true, json: true, help: false });
    assert.equal(parseReconfigureArgs(['--audit']).audit, true);
  });
  it('rejects invalid modes', () => {
    assert.throws(() => parseReconfigureArgs(['--gate','always']), /auto or off/u);
    assert.throws(() => parseReconfigureArgs(['--audit','--dry-run']), /cannot be combined/u);
  });
});
