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
  it('hardens every shipped upstream GitHub workflow', () => {
    const result = validate(rootDir);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), { status: 'ok', workflows: 7 });
  });

  it('reports not-applicable when the checkout configures no github forge', () => {
    const result = validate(checkoutWithout('gitlab-only', ['.github']));
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'not-applicable');
    assert.match(report.reason, /github/u);
  });

  it('rejects a product gitleaks config that replaces the boilerplate base', () => {
    const result = validate(
      checkoutWith('gitleaks-detached-base', {
        '.gitleaks.toml': 'title = "Product"\n\n[extend]\nuseDefault = true\n',
      }),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must extend/u);
  });

  it('rejects a base gitleaks config that dropped a boilerplate fixture allowlist', () => {
    const result = validate(
      checkoutWith('gitleaks-base-without-fixture', {
        'packages/tooling/config/gitleaks.base.toml': repositoryFile(
          'packages/tooling/config/gitleaks.base.toml',
        ).replace('sk-live-abc123', 'unrelated-value'),
      }),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing narrow fixture allowlist/u);
  });

  it('rejects a pipeline that lets gitleaks discover its own configuration', () => {
    const result = validate(
      checkoutWith('gitleaks-implicit-config', {
        '.gitlab-ci.yml': repositoryFile('.gitlab-ci.yml').replace('--config .gitleaks.toml', ''),
      }),
    );
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('--config .gitleaks.toml'), result.stderr);
  });

  it('rejects an aggregate that forgets to enforce a required job', () => {
    const result = validate(
      checkoutWith('summary-missing-result', {
        '.github/workflows/ci.yml': repositoryFile('.github/workflows/ci.yml').replace(
          '          ${{ needs.mongodb-validation.result }}\n',
          '',
        ),
      }),
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /REQUIRED_RESULTS must enforce every gate job; missing: mongodb-validation/u);
  });
});
