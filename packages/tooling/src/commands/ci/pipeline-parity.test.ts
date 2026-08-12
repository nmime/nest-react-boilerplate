// @requirements REQ-ASSURANCE-RELEASE-003
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCiContract } from './pipeline-contract';
import { evaluateParity } from './pipeline-parity';

const contract = parseCiContract({
  forges: {
    github: {
      pipeline: '.github/workflows/ci.yml',
      jobStyle: 'github',
      aggregateJob: 'ci-status-summary',
      releasePipeline: '.github/workflows/release-images.yml',
    },
    gitlab: {
      pipeline: '.gitlab-ci.yml',
      jobStyle: 'gitlab',
      aggregateJob: 'ci-status-summary',
      releasePipeline: '.gitlab-ci.yml',
    },
  },
  lanes: {
    pr: {
      description: 'Merge-blocking lane.',
      executors: {
        github: { file: '.github/workflows/ci.yml', job: 'fast-check' },
        gitlab: { file: '.gitlab-ci.yml', job: 'fast-check' },
      },
    },
  },
  gates: [
    {
      id: 'static-check',
      description: 'Repo tooling static validation.',
      commands: ['pnpm run tooling:static-check', 'pnpm run ci:pr'],
      lanes: ['pr'],
      requiredForMerge: true,
      jobs: { github: 'fast-check', gitlab: 'fast-check' },
    },
  ],
  supplyChain: [
    {
      id: 'keyless-signing',
      requirement: 'Every published digest is signed.',
      scope: 'release',
      evidence: ['cosign sign --yes'],
    },
  ],
});

const githubPipeline = [
  'jobs:',
  '  fast-check:',
  '    steps:',
  '      - run: pnpm run ci:pr',
  '  ci-status-summary:',
  '    needs:',
  '      - fast-check',
].join('\n');

const gitlabPipeline = [
  'fast-check:',
  '  script:',
  '    - pnpm run ci:pr',
  'ci-status-summary:',
  '  needs:',
  '    - job: fast-check',
].join('\n');

const githubSourcesFor = (pipeline: string) => ({
  pipeline,
  releasePipeline: 'cosign sign --yes "$ref"',
  laneFiles: { '.github/workflows/ci.yml': pipeline },
});

const gitlabSourcesFor = (pipeline: string) => ({
  pipeline,
  releasePipeline: `${pipeline}\ncosign sign --yes "$ref"`,
  laneFiles: { '.gitlab-ci.yml': pipeline },
});

const githubSources = githubSourcesFor(githubPipeline);
const gitlabSources = gitlabSourcesFor(gitlabPipeline);

describe('cross-forge gate parity', () => {
  it('reports no problems when both forges run every declared gate', () => {
    const report = evaluateParity(contract, { github: githubSources, gitlab: gitlabSources });

    assert.deepEqual(report.problems, []);
    assert.deepEqual(report.skippedForges, []);
  });

  // The whole point of the descriptor: a gate that exists on one forge and not the
  // other is a finding, not an invisible difference.
  it('fails when a forge maps a gate to a job that pipeline does not define', () => {
    const report = evaluateParity(contract, {
      github: githubSources,
      gitlab: gitlabSourcesFor('other-job:\n  script:\n    - echo hi\n'),
    });

    assert.deepEqual(
      report.problems.map(({ code, forge, gate }) => ({ code, forge, gate })),
      [
        { code: 'job-missing', forge: 'gitlab', gate: 'static-check' },
        { code: 'aggregate-missing', forge: 'gitlab', gate: undefined },
        { code: 'lane-executor-missing', forge: 'gitlab', gate: undefined },
      ],
    );
  });

  it('fails when the mapped job exists but never runs one of the gate commands', () => {
    const report = evaluateParity(contract, {
      github: githubSources,
      gitlab: gitlabSourcesFor(gitlabPipeline.replace('pnpm run ci:pr', 'echo skipped')),
    });

    assert.equal(report.problems[0]?.code, 'command-missing');
    assert.equal(report.problems[0]?.gate, 'static-check');
  });

  it('fails when a merge-required gate is not fanned into the aggregate job', () => {
    const report = evaluateParity(contract, {
      github: githubSourcesFor(githubPipeline.replace('      - fast-check', '      - something-else')),
      gitlab: gitlabSources,
    });

    assert.equal(report.problems[0]?.code, 'aggregate-missing-job');
    assert.equal(report.problems[0]?.forge, 'github');
  });

  it('fails when a supply-chain control has no implementation in a forge release lane', () => {
    const report = evaluateParity(contract, {
      github: { ...githubSources, releasePipeline: 'docker buildx bake' },
      gitlab: gitlabSources,
    });

    assert.equal(report.problems[0]?.code, 'supply-chain-control-missing');
    assert.match(report.problems[0]?.message ?? '', /keyless-signing/u);
  });

  // A downstream that keeps one forge must get an explicit "not configured" result
  // rather than a validator that silently passes over missing gates.
  it('skips a forge whose pipeline file is absent instead of failing or passing silently', () => {
    const report = evaluateParity(contract, { github: githubSources, gitlab: undefined });

    assert.deepEqual(report.problems, []);
    assert.deepEqual(report.skippedForges, ['gitlab']);
  });

  // The image build/scan/sign lane is the gate GitLab was missing entirely, and it
  // lives in a different file from the merge pipeline on GitHub.
  it('checks a release-pipeline gate against the release file, not the merge pipeline', () => {
    const releaseAware = parseCiContract({
      ...JSON.parse(JSON.stringify(contract)),
      gates: [
        {
          id: 'release-images',
          description: 'Build, scan, sign, and publish release images.',
          commands: ['docker buildx bake -f docker-bake.json'],
          lanes: ['pr'],
          requiredForMerge: false,
          pipeline: 'release',
          jobs: { github: 'build-scan-sign', gitlab: 'release-images' },
        },
      ],
    });

    const report = evaluateParity(releaseAware, {
      github: {
        ...githubSources,
        releasePipeline: [
          'jobs:',
          '  build-scan-sign:',
          '    steps:',
          '      - run: docker buildx bake -f docker-bake.json',
          '      - run: cosign sign --yes "$ref"',
        ].join('\n'),
      },
      gitlab: gitlabSources,
    });

    assert.deepEqual(
      report.problems.map(({ code, forge }) => ({ code, forge })),
      [{ code: 'job-missing', forge: 'gitlab' }],
    );
  });

  it('does not demand a forge-restricted supply-chain control from the forges it excludes', () => {
    const restricted = parseCiContract({
      ...JSON.parse(JSON.stringify(contract)),
      supplyChain: [
        {
          id: 'promotion-digest-pinning',
          requirement: 'Promotion accepts only a full 40-character SHA.',
          scope: 'promotion',
          evidence: ['^[0-9a-f]{40}$'],
          forges: ['github'],
          reason: 'Only GitHub ships a GitOps promotion pipeline today.',
        },
      ],
    });

    const report = evaluateParity(restricted, {
      github: { ...githubSources, promotionPipeline: 'sha must match ^[0-9a-f]{40}$' },
      gitlab: gitlabSources,
    });

    assert.deepEqual(report.problems, []);
  });

  it('accepts a forge-restricted gate only on the forges it names', () => {
    const restricted = parseCiContract({
      ...JSON.parse(JSON.stringify(contract)),
      gates: [
        {
          id: 'static-check',
          description: 'Repo tooling static validation.',
          commands: ['pnpm run ci:pr'],
          lanes: ['pr'],
          requiredForMerge: true,
          jobs: { github: 'fast-check' },
          forges: ['github'],
          reason: 'The checker it runs reads GitHub workflow text and cannot pass elsewhere.',
        },
      ],
    });

    const report = evaluateParity(restricted, { github: githubSources, gitlab: gitlabSources });

    assert.deepEqual(report.problems, []);
  });
});
