// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

/**
 * The same checkout with some files rewritten, so a case can break one contract and keep the rest.
 *
 * Only the directories on the way to a rewritten file are materialized; everything else stays a
 * link, which is what keeps a whole-repository fixture free.
 */
function checkoutWith(name, replacements) {
  const root = join(temporaryRoot, name);
  const replaced = new Map(Object.entries(replacements));
  const shadowed = new Set();
  for (const path of replaced.keys()) {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index += 1) shadowed.add(segments.slice(0, index).join('/'));
  }

  const materialize = (directory) => {
    mkdirSync(join(root, directory), { recursive: true });
    for (const entry of readdirSync(join(rootDir, directory))) {
      if (entry === 'node_modules') continue;
      const relative = directory ? `${directory}/${entry}` : entry;
      if (replaced.has(relative)) writeFileSync(join(root, relative), replaced.get(relative));
      else if (shadowed.has(relative)) materialize(relative);
      else symlinkSync(join(rootDir, relative), join(root, relative));
    }
  };
  materialize('');
  return root;
}

function repositoryFile(path) {
  return readFileSync(join(rootDir, path), 'utf8');
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
  // GitHub Actions was dropped from this template (CI lives in GitLab), so this checkout configures
  // no github forge and the validator must stand down explicitly rather than assert nothing.
  it('stands down on a checkout that configures no github forge', () => {
    const result = validate(rootDir);

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'not-applicable');
    assert.match(report.reason, /github/u, 'the forge that was not configured must be named');
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

  // The secret-scanning config is split so a product can register its own fixtures without editing
  // a file upstream rewrites. GitHub Actions was dropped from this template, so the gitleaks split
  // is enforced by the forge-neutral ci-pipeline-parity gate, not this GitHub-only validator: here
  // the checkout stands down, and each case pins that it does so explicitly rather than silently.
  it('stands down on a product gitleaks config that replaces the boilerplate base', () => {
    const result = validate(
      checkoutWith('gitleaks-detached-base', {
        '.gitleaks.toml': 'title = "Product"\n\n[extend]\nuseDefault = true\n',
      }),
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'not-applicable');
  });

  it('stands down on a base gitleaks config that dropped a boilerplate fixture allowlist', () => {
    const result = validate(
      checkoutWith('gitleaks-base-without-fixture', {
        'packages/tooling/config/gitleaks.base.toml': repositoryFile(
          'packages/tooling/config/gitleaks.base.toml',
        ).replace('sk-live-abc123', 'unrelated-value'),
      }),
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'not-applicable');
  });

  it('stands down on a pipeline that lets gitleaks discover its own configuration', () => {
    const result = validate(
      checkoutWith('gitleaks-implicit-config', {
        '.gitlab-ci.yml': repositoryFile('.gitlab-ci.yml').replace('--config .gitleaks.toml', ''),
      }),
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'not-applicable');
  });
});
