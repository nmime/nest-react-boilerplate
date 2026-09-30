// @requirements REQ-ASSURANCE-RELEASE-003
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { describe, it } from 'node:test';

import { collectForgeSources, configuredForges, declaredPipelineFiles, loadCiContract, runCiPipelineCheck } from './check-pipelines';
import { evaluateParity } from './pipeline-parity';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');

describe('shipped CI gate descriptor', () => {
  it('returns failure when a valid descriptor has no configured pipeline', () => {
    const root = mkdtempSync(join(tmpdir(), 'nrb-absent-forges-'));
    try {
      mkdirSync(join(root, 'scripts/ci'), { recursive: true });
      writeFileSync(join(root, 'scripts/ci/gates.json'), JSON.stringify(loadCiContract(workspaceRoot)));
      const lines: string[] = [];
      assert.equal(runCiPipelineCheck({ workspaceRoot: root, write: (line) => lines.push(line) }), 1);
      assert.ok(lines.some((line) => line.includes('no-configured-forge')));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('allows the schedule-only operational need without making mandatory merge jobs optional', () => {
    const pipeline = parse(readFileSync(join(workspaceRoot, '.gitlab-ci.yml'), 'utf8')) as Record<string, {
      needs?: Array<{ job: string; optional?: boolean }>;
      rules?: Array<{ if?: string }>;
    }>;
    assert.deepEqual(pipeline['ops-gates']?.rules, [{ if: '$CI_PIPELINE_SOURCE == "schedule"' }]);
    const needs = pipeline['ci-status-summary']?.needs ?? [];
    assert.equal(needs.find((need) => need.job === 'ops-gates')?.optional, true);
    for (const job of ['fast-check', 'full-check', 'component-tests']) {
      const need = needs.find((need) => need.job === job);
      assert.ok(need, `${job} remains required by the merge aggregate`);
      assert.notEqual(need.optional, true);
    }
  });

  it('is a valid contract', () => {
    const contract = loadCiContract(workspaceRoot);

    assert.ok(contract.gates.length > 0, 'the descriptor must inventory at least one gate');
    assert.ok(Object.keys(contract.forges).includes('gitlab'), 'GitLab must be a first-class forge');
    assert.ok(Object.keys(contract.forges).includes('github'), 'the protected GitHub upstream must be configured');
  });

  // This is the drift gate: adding a job to one forge and not the other, or dropping a
  // signing step from one release lane, fails here instead of silently downgrading the
  // forge nobody looked at.
  it('matches what every configured forge actually runs', () => {
    const contract = loadCiContract(workspaceRoot);
    const report = evaluateParity(contract, collectForgeSources(workspaceRoot, contract));

    assert.deepEqual(
      report.problems.map(({ message }) => message),
      [],
    );
  });

  it('exits zero for the shipped workspace', () => {
    const lines: string[] = [];

    assert.equal(runCiPipelineCheck({ workspaceRoot, write: (line) => lines.push(line) }), 0);
    assert.ok(lines.some((line) => line.includes('gates')));
  });

  it('reports a forge as not configured rather than skipping it silently', () => {
    const contract = loadCiContract(workspaceRoot);
    const sources = collectForgeSources(resolve(workspaceRoot, 'packages'), contract);

    assert.ok(Object.keys(contract.forges).length > 0, 'the descriptor must declare a forge to test');
    assert.deepEqual(
      Object.entries(sources).map(([forgeId, source]) => [forgeId, source === undefined]),
      Object.keys(contract.forges).map((forgeId) => [forgeId, true]),
      'every declared forge reports as not configured when its pipeline is absent',
    );
  });
});

// Validators that scan pipeline *text* — the world-class ops gate, the
// GitOps config validator — used to name `.github/workflows/...` themselves, which made every
// one of them dead code (or a false failure) on any other forge. These two helpers are how they
// ask the descriptor instead.
describe('descriptor-driven pipeline discovery', () => {
  it('names every pipeline file the descriptor declares, across forges and lanes', () => {
    const files = declaredPipelineFiles(workspaceRoot);

    assert.ok(files.includes('.gitlab-ci.yml'), 'the GitLab pipeline must be in scope');
    assert.deepEqual(files.filter((file) => file.startsWith('.github/')), [
      '.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.github/workflows/quality-presets.yml',
      '.github/workflows/release-images.yml', '.github/workflows/release.yml',
      '.github/workflows/spec-assurance-nightly.yml', '.github/workflows/spec-assurance-runtime.yml',
    ]);
    assert.deepEqual([...files].sort(), files, 'the order must be stable for reproducible reports');
  });

  it('returns nothing rather than throwing when the descriptor is absent', () => {
    assert.deepEqual(declaredPipelineFiles(resolve(workspaceRoot, 'packages')), []);
  });

  it('reports each forge with the release and promotion pipelines it actually ships', () => {
    const forges = configuredForges(workspaceRoot);

    assert.deepEqual(
      forges.map(({ id }) => id).sort(),
      ['github', 'gitlab'],
      'both shipped forges are explicit in the descriptor',
    );
    const gitlab = forges.find(({ id }) => id === 'gitlab');
    const github = forges.find(({ id }) => id === 'github');
    assert.equal(gitlab?.jobStyle, 'gitlab');
    assert.equal(gitlab?.pipeline, '.gitlab-ci.yml');
    assert.equal(gitlab?.releasePipeline, '.gitlab-ci.yml');
    assert.equal(gitlab?.provenancePipeline, '.gitlab-ci.yml');
    assert.equal(gitlab?.promotionPipeline, undefined);
    assert.equal(github?.pipeline, '.github/workflows/ci.yml');
    assert.equal(github?.releasePipeline, '.github/workflows/release-images.yml');
    assert.equal(github?.provenancePipeline, '.github/workflows/release.yml');
    assert.equal(github?.promotionPipeline, '.github/workflows/deploy.yml');
  });

  it('omits a forge whose pipeline file this checkout does not contain', () => {
    assert.deepEqual(configuredForges(resolve(workspaceRoot, 'packages')), []);
  });
});
