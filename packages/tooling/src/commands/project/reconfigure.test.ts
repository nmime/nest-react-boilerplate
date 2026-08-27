// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNrbConfig } from '../../setup/schema.js';
import { emptyState } from '../../setup/state.js';
import { buildReconfigureJsonResult, parseReconfigureArgs } from './reconfigure.js';

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

  it('preserves the exact stable JSON result contract', () => {
    const config = parseNrbConfig({ schemaVersion: '2.0.0' });
    const json = buildReconfigureJsonResult(
      {
        status: 'already-up-to-date',
        conflicts: [],
        gate: 'green',
        failedGate: undefined,
        plan: {
          operations: [],
          rewriteOperations: [],
          config,
          configHash: 'a'.repeat(64),
          manifest: {
            version: 1,
            templateBase: 'head',
            apps: config.apps,
            capabilities: config.capabilities,
            identity: config.identity,
            product: config.product,
            deployment: config.deployment,
            runtime: config.runtime,
            session: config.session,
            tenant: config.tenant,
            appRenames: config.appRenames,
            configHash: 'a'.repeat(64),
            gate: 'green',
            appliedFiles: {},
          },
          state: emptyState,
          files: [],
          rulesByFile: {},
          alreadyUpToDate: true,
        },
      },
      config,
    );

    assert.deepEqual(Object.keys(json), ['status', 'config', 'filesChanged', 'files']);
    assert.deepEqual(json, {
      status: 'already-up-to-date',
      config,
      filesChanged: 0,
      files: [],
    });
  });
});
