// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boundedInteger,
  ciOpsGateProblems,
  disallowedRequiredSkips,
  parseCommandArgv,
  unknownWorldClassGates,
} from './world-class-policy';

describe('world-class focused gate policy', () => {
  it('does not fail a focused CI run for gates that were intentionally not selected', () => {
    const skipped = [
      { name: 'load-stress-soak', reason: 'not selected' },
      { name: 'observability', reason: 'not selected' },
    ];

    assert.deepEqual(
      disallowedRequiredSkips({
        allowCiSkips: false,
        ciMode: true,
        selectedGates: new Set(['reliability-smoke']),
        skipped,
      }),
      [],
    );
  });

  it('keeps a selected or full-suite required skip fail-closed in CI', () => {
    const selectedSkip = [{ name: 'reliability-smoke', reason: 'runtime unavailable' }];

    assert.deepEqual(
      disallowedRequiredSkips({
        allowCiSkips: false,
        ciMode: true,
        selectedGates: new Set(['reliability-smoke']),
        skipped: selectedSkip,
      }),
      selectedSkip,
    );
    assert.deepEqual(
      disallowedRequiredSkips({
        allowCiSkips: false,
        ciMode: true,
        selectedGates: new Set(),
        skipped: selectedSkip,
      }),
      selectedSkip,
    );
  });

  it('rejects unknown focused gate names instead of producing an empty pass', () => {
    assert.deepEqual(
      unknownWorldClassGates(new Set(['reliability-smoke', 'reliabilty-smoke'])),
      ['reliabilty-smoke'],
    );
  });

  it('accepts only shell-free JSON command argv', () => {
    assert.deepEqual(
      parseCommandArgv('["pnpm","run","test:fullstack"]', 'QA_USER_JOURNEY_COMMAND'),
      ['pnpm', 'run', 'test:fullstack'],
    );
    assert.throws(
      () => parseCommandArgv('pnpm run test:fullstack', 'QA_USER_JOURNEY_COMMAND'),
      /JSON array/u,
    );
    assert.throws(
      () => parseCommandArgv('["pnpm",""]', 'QA_USER_JOURNEY_COMMAND'),
      /non-empty strings/u,
    );
  });

  it('caps resource-sensitive integer settings', () => {
    assert.equal(
      boundedInteger({ fallback: 16, label: 'QA_RELIABILITY_CONCURRENCY', max: 32 }),
      16,
    );
    assert.equal(
      boundedInteger({ fallback: 16, label: 'QA_RELIABILITY_CONCURRENCY', max: 32, value: '32' }),
      32,
    );
    assert.throws(
      () => boundedInteger({ fallback: 16, label: 'QA_RELIABILITY_CONCURRENCY', max: 32, value: '33' }),
      /between 1 and 32/u,
    );
  });
});

describe('world-class CI ops gate policy', () => {
  const packageJson = JSON.stringify({ scripts: { 'quality:presets': 'node scripts/quality-presets.mjs' } });

  it('accepts any declared pipeline that runs the gates for real', () => {
    assert.deepEqual(
      ciOpsGateProblems({
        packageJson,
        pipelines: [{ file: '.gitlab-ci.yml', text: 'script:\n  - pnpm run test:world-class\n' }],
      }),
      [],
    );
  });

  // The gate used to read `.github/workflows/ci.yml` and `quality-presets.yml` by name, so a
  // GitLab-hosted product failed it no matter what its pipeline ran. What the gate actually
  // asserts is a property of the pipelines the CI descriptor declares, whichever forge owns them.
  it('holds on a forge that ships no GitHub workflow at all', () => {
    assert.deepEqual(
      ciOpsGateProblems({ packageJson, pipelines: [{ file: '.gitlab-ci.yml', text: 'script:\n  - pnpm run lint\n' }] }),
      ['CI must run world-class gates'],
    );
  });

  it('rejects an ops gate invoked in dry-run and names the pipeline that does it', () => {
    assert.deepEqual(
      ciOpsGateProblems({
        packageJson,
        pipelines: [{ file: '.gitlab-ci.yml', text: 'script:\n  - pnpm run test:world-class -- --dry-run\n' }],
      }),
      ['CI ops gates must not use dry-run: .gitlab-ci.yml'],
    );
  });

  // Concatenating every pipeline before matching made one file's unrelated `--dry-run` — a Helm
  // template render, a deploy preview — indict a different file that merely mentions the gates.
  it('does not blame an ops pipeline for an unrelated pipeline using dry-run', () => {
    assert.deepEqual(
      ciOpsGateProblems({
        packageJson,
        pipelines: [
          { file: '.github/workflows/ci.yml', text: 'run: pnpm run test:world-class\n' },
          { file: '.github/workflows/deploy.yml', text: 'run: helm upgrade --dry-run\n' },
        ],
      }),
      [],
    );
  });

  it('rejects a quality preset script that defaults to dry-run', () => {
    assert.deepEqual(
      ciOpsGateProblems({
        packageJson: JSON.stringify({ scripts: { 'quality:presets': 'node scripts/quality-presets.mjs --dry-run' } }),
        pipelines: [{ file: '.gitlab-ci.yml', text: 'script:\n  - pnpm run test:world-class\n' }],
      }),
      ['quality:presets must not default to dry-run'],
    );
  });
});
