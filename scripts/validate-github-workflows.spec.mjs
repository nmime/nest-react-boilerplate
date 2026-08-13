// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'nrb-workflow-hardening-'));

after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

/** A checkout of this repository with entries left out, built from links so the fixture is free. */
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

function validate(root) {
  return spawnSync(process.execPath, ['scripts/validate-github-workflows.mjs', `--root=${root}`], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

describe('GitHub workflow hardening', () => {
  // The hardening rules themselves are this script's own subject and its gate's business. What
  // these two cases pin is the decision in front of them: which checkouts it applies to at all.
  it('asserts against a checkout that configures the github forge', () => {
    const result = validate(rootDir);

    // The exit code has to be asserted here, not only the disposition. Without it this case passed
    // while the validator was crashing on a contract literal that had moved to another file, and
    // the only thing that noticed was the merge-blocking gate itself.
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stdout, /not-applicable/u, 'a configured forge must not be stood down from');
  });

  // This validator is merge-blocking evidence for two forge-neutral requirements, so on a checkout
  // that keeps a different forge it has to say why it asserted nothing. Crashing on the missing
  // directory — or quietly exiting 0 — would both be wrong: ci-pipeline-parity is what proves the
  // gate was not dropped, and it can only do that if this one is explicit about standing down.
  it('reports not-applicable when the checkout configures no github forge', () => {
    const result = validate(checkoutWithout('gitlab-only', ['.github']));

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'not-applicable');
    assert.match(report.reason, /github/u, 'the forge that was not configured must be named');
  });
});
