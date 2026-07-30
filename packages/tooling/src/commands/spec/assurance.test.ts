// @requirements REQ-ASSURANCE-INVENTORY-004
// Evidence for: REQ-ASSURANCE-FRESHNESS-002 REQ-ASSURANCE-INVENTORY-004 REQ-ASSURANCE-OWNERSHIP-006 REQ-ASSURANCE-TRACE-001
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  calculateImpactFromChangedFiles,
  calculateImpact,
  createTraceReport,
  loadAssuranceModel,
  verifyRequirements,
} from './assurance';
const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { force: true, recursive: true });
  }
});

function fixtureWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'nrb-assurance-'));
  workspaces.push(workspace);
  mkdirSync(join(workspace, 'apps/fixture'), { recursive: true });
  mkdirSync(join(workspace, 'openspec/specs/fixture'), { recursive: true });
  mkdirSync(join(workspace, 'apps/e2e/acceptance/features'), { recursive: true });
  mkdirSync(join(workspace, 'packages/tooling/config'), { recursive: true });
  writeFileSync(
    join(workspace, 'packages/tooling/config/spec-evidence.schema.json'),
    readFileSync(
      join(process.cwd(), 'packages/tooling/config/spec-evidence.schema.json'),
      'utf8',
    ),
  );
  writeFileSync(
    join(workspace, 'package.json'),
    JSON.stringify({ scripts: { 'fixture:check': 'true' } }),
  );
  writeFileSync(
    join(workspace, 'apps/fixture/project.json'),
    JSON.stringify({
      name: 'fixture',
      targets: {
        test: {},
        'static-check': {},
      },
    }),
  );
  writeFileSync(
    join(workspace, 'openspec/specs/fixture/spec.md'),
    `# Fixture\n\n## Requirements\n\n### Requirement: [REQ-FIXTURE-RULE-001] Fixture rule\n`,
  );
  writeFileSync(
    join(workspace, 'apps/e2e/acceptance/features/fixture.feature'),
    `@REQ-FIXTURE-RULE-001\nFeature: Fixture\n\n  @SCN-FIXTURE-RULE-01\n  Scenario: Fixture evidence\n    Given a fixture\n`,
  );
  writeFileSync(
    join(workspace, 'apps/fixture/evidence.test.ts'),
    '// @requirements REQ-FIXTURE-RULE-001\n',
  );
  writeFileSync(
    join(workspace, 'apps/fixture/storybook-test.ts'),
    'export const runStorybookTests = (): void => {};\n',
  );
  writeFileSync(
    join(workspace, 'openspec/specs/fixture/verification.yaml'),
    `version: 3
capability: fixture
owners:
  product: product
  verification: verification
requirements:
  - id: REQ-FIXTURE-RULE-001
    projects: [fixture]
    risk: high
    profiles: [acceptance, tooling]
    cucumber:
      disposition: acceptance
    evidence:
      - kind: cucumber
        file: apps/e2e/acceptance/features/fixture.feature
        scenario: SCN-FIXTURE-RULE-01
        target: fixture:test
        lanes: [pr, main]
      - kind: static
        file: apps/fixture/evidence.test.ts
        target: fixture:static-check
        lanes: [nightly]
      - kind: vitest
        file: apps/fixture/evidence.test.ts
        target: fixture:test
        lanes: [pr, main]
`,
  );
  return workspace;
}

function runGit(workspace: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: 'fixture@example.com',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.com',
      GIT_COMMITTER_NAME: 'Fixture',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function verificationFile(workspace: string): string {
  return join(workspace, 'openspec/specs/fixture/verification.yaml');
}

function writeNotApplicableFixture(
  workspace: string,
  options: {
    reason?: string;
    alternatives?: string[];
    profiles?: string[];
    includeCucumberEvidence?: boolean;
  } = {},
): void {
  const {
    reason = 'Tooling behavior is verified more precisely through focused executable checks.',
    alternatives = ['vitest'],
    profiles = ['tooling'],
    includeCucumberEvidence = false,
  } = options;
  if (!includeCucumberEvidence) {
    rmSync(join(workspace, 'apps/e2e/acceptance/features/fixture.feature'), {
      force: true,
    });
  }
  const cucumberEvidence = includeCucumberEvidence
    ? `      - kind: cucumber
        file: apps/e2e/acceptance/features/fixture.feature
        scenario: SCN-FIXTURE-RULE-01
        target: fixture:test
        lanes: [pr, main]
`
    : '';
  writeFileSync(
    verificationFile(workspace),
    `version: 3
capability: fixture
owners:
  product: product
  verification: verification
requirements:
  - id: REQ-FIXTURE-RULE-001
    projects: [fixture]
    risk: high
    profiles: [${profiles.join(', ')}]
    cucumber:
      disposition: not-applicable
      reason: ${reason}
      alternativeEvidence: [${alternatives.join(', ')}]
    evidence:
${cucumberEvidence}      - kind: static
        file: apps/fixture/evidence.test.ts
        target: fixture:static-check
        lanes: [nightly]
      - kind: vitest
        file: apps/fixture/evidence.test.ts
        target: fixture:test
        lanes: [pr, main]
`,
  );
}

test('builds a complete trace and selects only the requested evidence lane', () => {
  const workspace = fixtureWorkspace();
  const model = loadAssuranceModel(workspace);

  assert.deepEqual(model.errors, []);
  const pr = verifyRequirements({
    model,
    requirementIds: ['REQ-FIXTURE-RULE-001'],
    dryRun: true,
    lane: 'pr',
  });
  const nightly = verifyRequirements({
    model,
    requirementIds: ['REQ-FIXTURE-RULE-001'],
    dryRun: true,
    lane: 'nightly',
  });

  assert.equal(pr.status, 'planned');
  assert.equal(pr.workspaceState, 'planned');
  assert.equal(pr.trace.totals.behaviorTests, 1);
  assert.equal(pr.trace.totals.tracedBehaviorTests, 1);
  assert.equal(pr.trace.totals.features, 1);
  assert.equal(pr.trace.totals.scenarios, 1);
  assert.equal(pr.trace.totals.requirementsWithCucumberDisposition, 1);
  assert.equal(pr.trace.totals.acceptanceRequirements, 1);
  assert.equal(pr.trace.totals.cucumberNotApplicableRequirements, 0);
  assert.deepEqual(pr.trace.cucumberAlternativeEvidenceByKind, {});
  assert.deepEqual(pr.trace.requirements[0]?.cucumber, {
    disposition: 'acceptance',
  });
  assert.deepEqual(pr.runs.map(({ key }) => key), ['fixture:test']);
  assert.deepEqual(nightly.runs.map(({ key }) => key), ['fixture:static-check']);
});

test('repository-global source, config, workflow, and policy changes select every requirement', () => {
  const workspace = fixtureWorkspace();
  const model = loadAssuranceModel(workspace);
  const fixtureRequirement = model.requirements.get('REQ-FIXTURE-RULE-001');
  assert.ok(fixtureRequirement);
  model.projects.set('independent', {
    name: 'independent',
    root: 'apps/independent',
    targets: new Set(['test']),
  });
  model.requirements.set('REQ-INDEPENDENT-RULE-002', {
    ...fixtureRequirement,
    id: 'REQ-INDEPENDENT-RULE-002',
    projects: ['independent'],
    evidence: fixtureRequirement.evidence.map((evidence) => ({
      ...evidence,
      file: 'apps/independent/evidence.test.ts',
      target: 'independent:test',
    })),
  });

  for (const file of [
    'package.json',
    '.github/workflows/ci.yml',
    'AGENTS.md',
    'docs/ai/agent-policy.md',
    'packages/tooling/src/runtime/process.ts',
    'packages/tooling/config/spec-evidence.schema.json',
  ]) {
    const report = calculateImpactFromChangedFiles(model, 'base', 'head', [file]);
    assert.deepEqual(report.requirementIds, ['REQ-FIXTURE-RULE-001', 'REQ-INDEPENDENT-RULE-002'], file);
  }
});

test('a deleted repository-global file selects every requirement through the real Git diff', () => {
  const workspace = fixtureWorkspace();
  mkdirSync(join(workspace, '.github/workflows'), { recursive: true });
  writeFileSync(join(workspace, '.github/workflows/ci.yml'), 'name: fixture\n');
  runGit(workspace, ['init', '--quiet']);
  runGit(workspace, ['add', '.']);
  runGit(workspace, ['commit', '--quiet', '-m', 'fixture base']);
  const base = runGit(workspace, ['rev-parse', 'HEAD']);
  rmSync(join(workspace, '.github/workflows/ci.yml'));
  runGit(workspace, ['add', '-A']);
  runGit(workspace, ['commit', '--quiet', '-m', 'delete workflow']);
  const head = runGit(workspace, ['rev-parse', 'HEAD']);
  const model = loadAssuranceModel(workspace);

  const report = calculateImpact(model, base, head);

  assert.deepEqual(report.changedFiles, ['.github/workflows/ci.yml']);
  assert.deepEqual(report.requirementIds, ['REQ-FIXTURE-RULE-001']);
});

test('project-owned source changes retain focused requirement impact', () => {
  const workspace = fixtureWorkspace();
  const model = loadAssuranceModel(workspace);
  const fixtureRequirement = model.requirements.get('REQ-FIXTURE-RULE-001');
  assert.ok(fixtureRequirement);
  model.projects.set('independent', {
    name: 'independent',
    root: 'apps/independent',
    targets: new Set(['test']),
  });
  model.requirements.set('REQ-INDEPENDENT-RULE-002', {
    ...fixtureRequirement,
    id: 'REQ-INDEPENDENT-RULE-002',
    projects: ['independent'],
  });

  const report = calculateImpactFromChangedFiles(model, 'base', 'head', ['apps/fixture/source.ts']);
  assert.deepEqual(report.requirementIds, ['REQ-FIXTURE-RULE-001']);
});

test('accepts a justified not-applicable disposition backed by mapped alternative evidence', () => {
  const workspace = fixtureWorkspace();
  writeNotApplicableFixture(workspace);

  const model = loadAssuranceModel(workspace);
  const report = verifyRequirements({
    model,
    requirementIds: ['REQ-FIXTURE-RULE-001'],
    dryRun: true,
    lane: 'pr',
  });

  assert.deepEqual(model.errors, []);
  assert.equal(report.trace.totals.requirementsWithCucumberDisposition, 1);
  assert.equal(report.trace.totals.acceptanceRequirements, 0);
  assert.equal(report.trace.totals.cucumberNotApplicableRequirements, 1);
  assert.deepEqual(report.trace.cucumberAlternativeEvidenceByKind, {
    vitest: 1,
  });
});

test('rejects a requirement without an explicit Cucumber disposition', () => {
  const workspace = fixtureWorkspace();
  const file = verificationFile(workspace);
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      `    cucumber:
      disposition: acceptance
`,
      '',
    ),
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.some(
      (error) =>
        error.includes('verification.yaml') &&
        error.includes("must have required property 'cucumber'"),
    ),
  );
});

test('rejects a version 2 sidecar after the breaking contract migration', () => {
  const workspace = fixtureWorkspace();
  const file = verificationFile(workspace);
  writeFileSync(file, readFileSync(file, 'utf8').replace('version: 3', 'version: 2'));

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.some(
      (error) =>
        error.includes('verification.yaml/version') &&
        error.includes('must be equal to constant'),
    ),
  );
});

test('rejects Cucumber acceptance without the acceptance profile', () => {
  const workspace = fixtureWorkspace();
  const file = verificationFile(workspace);
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'profiles: [acceptance, tooling]',
      'profiles: [tooling]',
    ),
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber acceptance requires the acceptance profile',
    ),
  );
});

test('rejects Cucumber acceptance without mapped Cucumber evidence', () => {
  const workspace = fixtureWorkspace();
  const file = verificationFile(workspace);
  const verification = readFileSync(file, 'utf8');
  const withoutCucumberEvidence = verification.replace(
    `      - kind: cucumber
        file: apps/e2e/acceptance/features/fixture.feature
        scenario: SCN-FIXTURE-RULE-01
        target: fixture:test
        lanes: [pr, main]
`,
    '',
  );
  writeFileSync(file, withoutCucumberEvidence);
  rmSync(join(workspace, 'apps/e2e/acceptance/features/fixture.feature'), {
    force: true,
  });

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: profile acceptance requires cucumber evidence',
    ),
  );
  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber acceptance requires cucumber evidence',
    ),
  );
});

test('rejects not-applicable when acceptance profile and Cucumber evidence remain', () => {
  const workspace = fixtureWorkspace();
  writeNotApplicableFixture(workspace, {
    profiles: ['acceptance', 'tooling'],
    includeCucumberEvidence: true,
  });

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber not-applicable forbids the acceptance profile',
    ),
  );
  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber not-applicable forbids cucumber evidence',
    ),
  );
});

test('rejects a not-applicable alternative absent from requirement evidence', () => {
  const workspace = fixtureWorkspace();
  writeNotApplicableFixture(workspace, { alternatives: ['contract'] });

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber alternative contract is not mapped by requirement evidence',
    ),
  );
});

test('rejects a not-applicable reason containing only whitespace', () => {
  const workspace = fixtureWorkspace();
  writeNotApplicableFixture(workspace, { reason: '"                    "' });

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber not-applicable reason must contain at least 12 non-whitespace characters',
    ),
  );
});

test('rejects a placeholder not-applicable reason', () => {
  const workspace = fixtureWorkspace();
  writeNotApplicableFixture(workspace, { reason: 'Not applicable' });

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-001: Cucumber not-applicable reason must be requirement-specific, not placeholder text',
    ),
  );
});

test('rejects duplicate not-applicable rationales across requirements', () => {
  const workspace = fixtureWorkspace();
  const reason =
    'Tooling behavior is verified more precisely through focused executable checks.';
  writeNotApplicableFixture(workspace, { reason });
  writeFileSync(
    join(workspace, 'openspec/specs/fixture/spec.md'),
    `${readFileSync(join(workspace, 'openspec/specs/fixture/spec.md'), 'utf8')}
### Requirement: [REQ-FIXTURE-RULE-002] Second fixture rule
`,
  );
  writeFileSync(
    join(workspace, 'apps/fixture/evidence.test.ts'),
    '// @requirements REQ-FIXTURE-RULE-001 REQ-FIXTURE-RULE-002\n',
  );
  writeFileSync(
    verificationFile(workspace),
    `${readFileSync(verificationFile(workspace), 'utf8')}  - id: REQ-FIXTURE-RULE-002
    projects: [fixture]
    risk: high
    profiles: [tooling]
    cucumber:
      disposition: not-applicable
      reason: ${reason}
      alternativeEvidence: [vitest]
    evidence:
      - kind: vitest
        file: apps/fixture/evidence.test.ts
        target: fixture:test
        lanes: [pr, main]
`,
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: REQ-FIXTURE-RULE-002: Cucumber not-applicable reason duplicates REQ-FIXTURE-RULE-001; provide a requirement-specific rationale',
    ),
  );
});

test('rejects duplicate or Cucumber alternative evidence kinds', () => {
  const duplicateWorkspace = fixtureWorkspace();
  writeNotApplicableFixture(duplicateWorkspace, {
    alternatives: ['vitest', 'vitest'],
  });
  const duplicateModel = loadAssuranceModel(duplicateWorkspace);
  assert.ok(
    duplicateModel.errors.some(
      (error) =>
        error.includes('/cucumber/alternativeEvidence') &&
        error.includes('must NOT have duplicate items'),
    ),
  );

  const cucumberWorkspace = fixtureWorkspace();
  writeNotApplicableFixture(cucumberWorkspace, {
    alternatives: ['cucumber'],
  });
  const cucumberModel = loadAssuranceModel(cucumberWorkspace);
  assert.ok(
    cucumberModel.errors.some(
      (error) =>
        error.includes('/cucumber/alternativeEvidence/0') &&
        error.includes('must be equal to one of the allowed values'),
    ),
  );
});

test('keeps the complete repository disposition inventory synchronized', () => {
  const model = loadAssuranceModel(process.cwd());
  const report = createTraceReport(model);

  assert.deepEqual(model.errors, []);
  assert.equal(report.totals.requirements, 58);
  assert.equal(report.totals.requirementsWithCucumberDisposition, 58);
  assert.equal(report.totals.acceptanceRequirements, 5);
  assert.equal(report.totals.cucumberNotApplicableRequirements, 53);
  assert.equal(report.totals.projects, 90);
  assert.equal(report.totals.coveredProjects, 90);
  assert.equal(report.totals.behaviorTests, 462);
  assert.equal(report.totals.tracedBehaviorTests, 462);
  assert.ok(
    model.requirements
      .get('REQ-RUNTIME-OBSERVABILITY-005')
      ?.evidence.some(
        ({ file, script }) =>
          file === 'libs/backend/common/otel/lib/src/otel.runtime.spec.ts' &&
          script === 'test:observability',
      ),
    'The OTLP runtime test must be selected as authoritative observability evidence.',
  );
});

test('rejects an Nx project without capability ownership', () => {
  const workspace = fixtureWorkspace();
  mkdirSync(join(workspace, 'apps/orphan'), { recursive: true });
  writeFileSync(
    join(workspace, 'apps/orphan/project.json'),
    JSON.stringify({ name: 'orphan', targets: {} }),
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs: Nx project has no capability ownership: orphan',
    ),
  );
});

test('rejects an executable behavior test without a requirement marker', () => {
  const workspace = fixtureWorkspace();
  writeFileSync(join(workspace, 'apps/fixture/untraced.spec.ts'), 'export {};\n');

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'apps/fixture/untraced.spec.ts: executable behavior test requires a // @requirements REQ-... marker',
    ),
  );
});

test('rejects an executable behavior test that references an unknown requirement', () => {
  const workspace = fixtureWorkspace();
  writeFileSync(
    join(workspace, 'apps/fixture/unknown.spec.ts'),
    '// @requirements REQ-FIXTURE-UNKNOWN-999\n',
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'apps/fixture/unknown.spec.ts: @requirements references unknown REQ-FIXTURE-UNKNOWN-999',
    ),
  );
});

test('rejects a behavior test traced to a requirement that does not own its project', () => {
  const workspace = fixtureWorkspace();
  mkdirSync(join(workspace, 'apps/other'), { recursive: true });
  writeFileSync(
    join(workspace, 'apps/other/project.json'),
    JSON.stringify({ name: 'other', targets: {} }),
  );
  writeFileSync(
    join(workspace, 'apps/other/cross-owned.test.ts'),
    '// @requirements REQ-FIXTURE-RULE-001\n',
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'apps/other/cross-owned.test.ts: REQ-FIXTURE-RULE-001 does not own Nx project other',
    ),
  );
});

test('rejects unknown evidence manifest fields through the canonical JSON Schema', () => {
  const workspace = fixtureWorkspace();
  const verificationFile = join(
    workspace,
    'openspec/specs/fixture/verification.yaml',
  );
  writeFileSync(
    verificationFile,
    `${readFileSync(verificationFile, 'utf8')}unexpected: true\n`,
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.some(
      (error) =>
        error.includes('verification.yaml') &&
        error.includes('additional properties'),
    ),
  );
});

test('rejects an acceptance scenario without a requirement evidence mapping', () => {
  const workspace = fixtureWorkspace();
  const featureFile = join(
    workspace,
    'apps/e2e/acceptance/features/fixture.feature',
  );
  writeFileSync(
    featureFile,
    `${readFileSync(featureFile, 'utf8')}
  @SCN-FIXTURE-RULE-02
  Scenario: Orphaned example
    Given an unmapped fixture
`,
  );

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'apps/e2e/acceptance/features/fixture.feature: scenario SCN-FIXTURE-RULE-02 is not mapped by any requirement evidence',
    ),
  );
});

test('rejects duplicate requirement mappings in a verification manifest', () => {
  const workspace = fixtureWorkspace();
  const verificationFile = join(
    workspace,
    'openspec/specs/fixture/verification.yaml',
  );
  const verification = readFileSync(verificationFile, 'utf8');
  const duplicate = verification.slice(verification.indexOf('  - id:'));
  writeFileSync(verificationFile, `${verification}${duplicate}`);

  const model = loadAssuranceModel(workspace);

  assert.ok(
    model.errors.includes(
      'openspec/specs/fixture/verification.yaml: duplicate evidence mapping for REQ-FIXTURE-RULE-001',
    ),
  );
});
