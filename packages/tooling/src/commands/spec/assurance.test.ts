import assert from 'node:assert/strict';
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
import { loadAssuranceModel, verifyRequirements } from './assurance';

// Independent executable evidence for REQ-ASSURANCE-TRACE-001 and
// REQ-ASSURANCE-FRESHNESS-002.
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
    '// REQ-FIXTURE-RULE-001\n',
  );
  writeFileSync(
    join(workspace, 'openspec/specs/fixture/verification.yaml'),
    `version: 1
capability: fixture
owners:
  product: product
  verification: verification
projects:
  - fixture
requirements:
  - id: REQ-FIXTURE-RULE-001
    risk: high
    profiles: [acceptance, tooling]
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
  assert.deepEqual(pr.runs.map(({ key }) => key), ['fixture:test']);
  assert.deepEqual(nightly.runs.map(({ key }) => key), ['fixture:static-check']);
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
