// @requirements REQ-SCAFFOLD-TOOLING-005
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, it } from 'node:test';

import { mismatchedPnpmPins, pnpmPinSources } from './pnpm-pins';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'nrb-pnpm-pins-'));

after(() => rmSync(temporaryRoot, { force: true, recursive: true }));

function fixtureWorkspace(name: string, files: Record<string, string>): string {
  const root = join(temporaryRoot, name);
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(join(root, dirname(file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  }
  return root;
}

// Every forge spells "install the pnpm this repository pins" differently. The check has to
// read all of those spellings, because a pin that drifts on the forge nobody looked at
// installs a different package manager than the lockfile was resolved with.
describe('pnpm pin extraction', () => {
  it('reports a pipeline variable that drifts from packageManager', () => {
    const gitlab = ["variables:", "  PNPM_VERSION: '9.0.0'"].join('\n');

    assert.deepEqual(mismatchedPnpmPins([{ name: '.gitlab-ci.yml', source: gitlab }], '11.15.1'), [
      '.gitlab-ci.yml: 9.0.0',
    ]);
  });

  it('reports a version written straight into corepack prepare', () => {
    const gitlab = ['before_script:', '  - corepack enable pnpm', '  - corepack prepare pnpm@9.0.0 --activate'].join(
      '\n',
    );

    assert.deepEqual(mismatchedPnpmPins([{ name: '.gitlab-ci.yml', source: gitlab }], '11.15.1'), [
      '.gitlab-ci.yml: 9.0.0',
    ]);
  });

  it('reports a version pinned inline on the setup action', () => {
    const workflow = ['      - uses: pnpm/action-setup@0ebf471', '        with:', '          version: 9.0.0'].join('\n');

    assert.deepEqual(mismatchedPnpmPins([{ name: 'ci.yml', source: workflow }], '11.15.1'), ['ci.yml: 9.0.0']);
  });

  it('accepts every spelling once it names the pinned version', () => {
    const sources = [
      { name: '.gitlab-ci.yml', source: "  PNPM_VERSION: '11.15.1'\n  - corepack prepare pnpm@11.15.1 --activate" },
      { name: 'ci.yml', source: '      - uses: pnpm/action-setup@0ebf471\n        with:\n          version: 11.15.1' },
      { name: 'indirect.yml', source: '  - corepack prepare pnpm@$PNPM_VERSION --activate' },
    ];

    assert.deepEqual(mismatchedPnpmPins(sources, '11.15.1'), []);
  });
});

describe('descriptor-driven pnpm pin sources', () => {
  it('reads every pipeline the shipped descriptor declares, on both forges', () => {
    const names = pnpmPinSources(workspaceRoot).map(({ name }) => name);

    assert.ok(names.includes('.gitlab-ci.yml'), 'the GitLab pipeline pins pnpm too');
    assert.ok(names.includes('.github/workflows/ci.yml'), 'the GitHub pipeline must stay in scope');
    assert.ok(
      names.includes('.github/workflows/dependency-review.yml'),
      'a forge with a pipeline directory is scanned whole, so a workflow the descriptor does not name still cannot drift',
    );
  });

  it('reads a checkout whose only forge is not GitHub without touching .github', () => {
    const root = fixtureWorkspace('gitlab-only', {
      'scripts/ci/gates.json': JSON.stringify({
        forges: { gitlab: { pipeline: '.gitlab-ci.yml', jobStyle: 'gitlab', aggregateJob: 'ci-status-summary' } },
        lanes: { pr: { description: 'Merge evidence.', executors: { gitlab: { file: '.gitlab-ci.yml', job: 'x' } } } },
        gates: [],
        supplyChain: [],
      }),
      '.gitlab-ci.yml': "variables:\n  PNPM_VERSION: '9.0.0'\n",
    });

    assert.deepEqual(
      pnpmPinSources(root).map(({ name }) => name),
      ['.gitlab-ci.yml'],
    );
    assert.deepEqual(mismatchedPnpmPins(pnpmPinSources(root), '11.15.1'), ['.gitlab-ci.yml: 9.0.0']);
  });

  it('yields nothing rather than throwing when no descriptor declares a pipeline', () => {
    assert.deepEqual(pnpmPinSources(join(temporaryRoot, 'absent')), []);
  });
});
