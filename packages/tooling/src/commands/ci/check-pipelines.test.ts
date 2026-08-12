// @requirements REQ-ASSURANCE-RELEASE-003
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { collectForgeSources, configuredForges, declaredPipelineFiles, loadCiContract, runCiPipelineCheck } from './check-pipelines';
import { evaluateParity } from './pipeline-parity';

const workspaceRoot = resolve(import.meta.dirname, '../../../../..');

describe('shipped CI gate descriptor', () => {
  it('is a valid contract', () => {
    const contract = loadCiContract(workspaceRoot);

    assert.ok(contract.gates.length > 0, 'the descriptor must inventory at least one gate');
    assert.ok(Object.keys(contract.forges).includes('gitlab'), 'GitLab must be a first-class forge');
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

    assert.deepEqual(Object.values(sources), [undefined, undefined]);
  });
});

// Validators that scan pipeline *text* — the Bun parity check, the world-class ops gate, the
// GitOps config validator — used to name `.github/workflows/...` themselves, which made every
// one of them dead code (or a false failure) on any other forge. These two helpers are how they
// ask the descriptor instead.
describe('descriptor-driven pipeline discovery', () => {
  it('names every pipeline file the descriptor declares, across forges and lanes', () => {
    const files = declaredPipelineFiles(workspaceRoot);

    assert.ok(files.includes('.gitlab-ci.yml'), 'the GitLab pipeline must be in scope');
    assert.ok(files.includes('.github/workflows/ci.yml'), 'the GitHub pipeline must be in scope');
    assert.ok(files.includes('.github/workflows/quality-presets.yml'), 'lane executor files must be in scope too');
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
      'both shipped forges are configured in this repository',
    );
    const github = forges.find(({ id }) => id === 'github');
    assert.equal(github?.jobStyle, 'github');
    assert.equal(github?.promotionPipeline, '.github/workflows/deploy.yml');
    assert.equal(forges.find(({ id }) => id === 'gitlab')?.promotionPipeline, undefined);
  });

  it('omits a forge whose pipeline file this checkout does not contain', () => {
    assert.deepEqual(configuredForges(resolve(workspaceRoot, 'packages')), []);
  });
});
