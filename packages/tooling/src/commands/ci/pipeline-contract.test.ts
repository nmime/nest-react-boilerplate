// @requirements REQ-ASSURANCE-RELEASE-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractJob, parseCiContract } from './pipeline-contract';

const minimalContract = {
  forges: {
    github: { pipeline: '.github/workflows/ci.yml', jobStyle: 'github', aggregateJob: 'ci-status-summary' },
    gitlab: { pipeline: '.gitlab-ci.yml', jobStyle: 'gitlab', aggregateJob: 'ci-status-summary' },
  },
  lanes: {
    pr: {
      description: 'Runs on every change proposal.',
      executors: {
        github: { file: '.github/workflows/ci.yml', job: 'spec-evidence' },
        gitlab: { file: '.gitlab-ci.yml', job: 'spec-evidence' },
      },
    },
  },
  gates: [
    {
      id: 'static-check',
      description: 'Repo tooling static validation.',
      commands: ['pnpm run tooling:static-check'],
      lanes: ['pr'],
      requiredForMerge: true,
      jobs: { github: 'fast-check', gitlab: 'fast-check' },
    },
  ],
  supplyChain: [],
};

describe('CI gate contract', () => {
  it('parses a descriptor that both forges can render', () => {
    const contract = parseCiContract(minimalContract);

    assert.deepEqual(Object.keys(contract.forges), ['github', 'gitlab']);
    assert.equal(contract.gates[0]?.id, 'static-check');
    assert.equal(contract.forges.github?.aggregateJob, 'ci-status-summary');
  });

  it('rejects a gate that names a lane the descriptor never declares', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          gates: [{ ...minimalContract.gates[0], lanes: ['nightly'] }],
        }),
      /unknown lane "nightly"/u,
    );
  });

  it('rejects a gate that names a toolchain the descriptor never declares', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          gates: [{ ...minimalContract.gates[0], toolchain: ['helm'] }],
        }),
      /unknown toolchain "helm"/u,
    );
  });

  it('rejects a toolchain whose provisioning names a forge the descriptor never declares', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          toolchains: {
            helm: { description: 'Helm CLI.', provisioning: { buildkite: 'setup-helm' } },
          },
        }),
      /unknown forge "buildkite"/u,
    );
  });

  it('rejects a gate that names a forge the descriptor never declares', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          gates: [{ ...minimalContract.gates[0], jobs: { buildkite: 'fast-check' } }],
        }),
      /unknown forge "buildkite"/u,
    );
  });

  // A single-forge gate is the drift this descriptor exists to make visible, so it is
  // allowed only when the descriptor says out loud why the other forge cannot run it.
  it('rejects a forge-restricted gate that carries no recorded reason', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          gates: [{ ...minimalContract.gates[0], forges: ['github'] }],
        }),
      /must record a reason/u,
    );
  });

  it('rejects a forge-restricted supply-chain control that carries no recorded reason', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          supplyChain: [
            {
              id: 'promotion-digest-pinning',
              requirement: 'Promotion accepts only a full 40-character SHA.',
              scope: 'promotion',
              evidence: ['^[0-9a-f]{40}$'],
              forges: ['github'],
            },
          ],
        }),
      /must record a reason/u,
    );
  });

  // A merge-required gate has to live in the pipeline the aggregate job fans in;
  // a gate in the tag-triggered release pipeline can never gate a merge.
  it('rejects a merge-required gate that lives outside the merge pipeline', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          gates: [{ ...minimalContract.gates[0], pipeline: 'release' }],
        }),
      /cannot be required for merge/u,
    );
  });

  it('rejects duplicate gate identifiers', () => {
    assert.throws(
      () =>
        parseCiContract({
          ...minimalContract,
          gates: [minimalContract.gates[0], minimalContract.gates[0]],
        }),
      /duplicate gate id "static-check"/u,
    );
  });
});

describe('pipeline job extraction', () => {
  const githubPipeline = ['jobs:', '  fast-check:', '    steps:', '      - run: pnpm run ci:pr', '  quality:', '    steps:'].join(
    '\n',
  );
  const gitlabPipeline = ['fast-check:', '  script:', '    - pnpm run ci:pr', 'quality:', '  script:'].join('\n');

  it('isolates a GitHub job from the next job at the same indent', () => {
    const block = extractJob(githubPipeline, 'fast-check', 'github');

    assert.ok(block?.includes('pnpm run ci:pr'));
    assert.ok(!block?.includes('quality:'));
  });

  it('isolates a GitLab job from the next top-level key', () => {
    const block = extractJob(gitlabPipeline, 'fast-check', 'gitlab');

    assert.ok(block?.includes('pnpm run ci:pr'));
    assert.ok(!block?.includes('quality:'));
  });

  // `docker-fullstack` is a prefix of `docker-fullstack-mongodb`; a substring search
  // silently returns the wrong block and reports a gate as covered when it is not.
  it('does not match a job whose name is a prefix of another job', () => {
    assert.equal(extractJob('docker-fullstack-mongodb:\n  script:\n    - run\n', 'docker-fullstack', 'gitlab'), undefined);
  });
});
