// @requirements REQ-RUNTIME-DELIVERY-009
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'nrb-deployment-config-'));

after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

/**
 * A checkout of this repository with entries left out, built from links so the fixture costs
 * nothing. The validator asserts over most of the tree, so the interesting question is never
 * "what did we copy" but "which forge did we omit".
 */
function checkoutWithout(name, omitted) {
  const root = join(temporaryRoot, name);
  const omit = new Set(omitted);
  mkdirSync(root, { recursive: true });
  for (const entry of readdirSync(rootDir)) {
    if (omit.has(entry) || entry === 'node_modules') continue;
    symlinkSync(join(rootDir, entry), join(root, entry));
  }
  return root;
}

function validate(root, mode) {
  return spawnSync(process.execPath, ['scripts/validate-deployment-config.mjs', `--mode=${mode}`, `--root=${root}`], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, HELM_SELECTION_VALUES: join(root, '.helm', 'values-selection.yaml') },
  });
}

describe('deployment config validation across forges', () => {
  it('validates the shipped checkout, which configures every declared forge', () => {
    const result = validate(rootDir, 'helm');

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });

  // A product that keeps a single non-GitHub forge deletes .github/ outright. The claims this
  // validator makes about the runtime fixture and the release pipeline are forge-neutral, so
  // they have to be asserted against whichever pipeline the gate descriptor says runs them.
  it('validates a checkout whose only configured forge is not GitHub', () => {
    const result = validate(checkoutWithout('gitlab-only', ['.github']), 'helm');

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /gitlab/u, 'the forge that was validated must be named in the output');
  });

  // Passing because there was nothing left to read is the failure mode this whole descriptor
  // exists to prevent.
  it('fails rather than passing silently when no forge is configured', () => {
    const result = validate(checkoutWithout('no-forge', ['.github', '.gitlab-ci.yml']), 'helm');

    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /no configured forge/iu);
  });
});
