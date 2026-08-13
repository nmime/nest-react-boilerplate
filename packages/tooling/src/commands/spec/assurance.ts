// Evidence for: REQ-ASSURANCE-FRESHNESS-002 REQ-ASSURANCE-INVENTORY-004 REQ-ASSURANCE-OWNERSHIP-006 REQ-ASSURANCE-TRACE-001
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';
import { ensureDir, writeJson } from '../../runtime/files';
import { run, type RunResult } from '../../runtime/process';
import { configuredForges, declaredForgeIds } from '../ci/check-pipelines';

// Trace and exact-revision dossier implementation for
// REQ-ASSURANCE-TRACE-001 and REQ-ASSURANCE-FRESHNESS-002.

export const evidenceKinds = [
  'cucumber',
  'vitest',
  'playwright',
  'contract',
  'property',
  'component',
  'mutation',
  'security',
  'operations',
  'static',
  'documentation',
] as const;

export const evidenceProfiles = [
  'acceptance',
  'domain',
  'api',
  'journey',
  'async',
  'persistence',
  'security',
  'operations',
  'tooling',
  'documentation',
  'mutation',
] as const;

export const evidenceLanes = ['pr', 'main', 'nightly', 'runtime'] as const;

export type EvidenceKind = (typeof evidenceKinds)[number];
export type EvidenceProfile = (typeof evidenceProfiles)[number];
export type EvidenceLane = (typeof evidenceLanes)[number];
export type RequirementRisk = 'low' | 'normal' | 'high' | 'critical';
export type AlternativeEvidenceKind = Exclude<EvidenceKind, 'cucumber'>;

export type CucumberDisposition =
  | {
      disposition: 'acceptance';
    }
  | {
      disposition: 'not-applicable';
      reason: string;
      alternativeEvidence: AlternativeEvidenceKind[];
    };

export interface EvidenceReference {
  kind: EvidenceKind;
  file: string;
  lanes: EvidenceLane[];
  target?: string;
  script?: string;
  scenario?: string;
  description?: string;
  /**
   * Present only when this evidence exists on some forges and not others, using the ids in
   * `scripts/ci/gates.json`. Some checks are genuinely dialect-specific — GitHub Actions
   * hardening has no GitLab analogue — and a product that drops a forge deletes the validator
   * and the script along with the pipelines. Without this key the only way to keep
   * `spec:verify` green was to edit a boilerplate-owned manifest, which then conflicts on
   * every update.
   */
  forges?: string[];
  /** Why the restriction above exists. Mandatory whenever `forges` is set. */
  reason?: string;
}

export interface RequirementVerification {
  id: string;
  projects: string[];
  risk: RequirementRisk;
  profiles: EvidenceProfile[];
  cucumber: CucumberDisposition;
  evidence: EvidenceReference[];
}

/**
 * Schema version of `openspec/specs/*\/verification.yaml`. Exported so the authoring brief in
 * openspec/config.yaml is checked against the enforced number instead of restating it.
 */
export const evidenceSidecarVersion = 3;

export interface VerificationDocument {
  version: typeof evidenceSidecarVersion;
  capability: string;
  owners: {
    product: string;
    verification: string;
    security?: string;
    operations?: string;
  };
  requirements: RequirementVerification[];
}

export interface RequirementRecord extends RequirementVerification {
  capability: string;
  name: string;
  specFile: string;
  verificationFile: string;
  owners: VerificationDocument['owners'];
  projects: string[];
}

export interface ProjectRecord {
  name: string;
  root: string;
  targets: Set<string>;
}

export interface BehaviorTestRecord {
  file: string;
  project?: string;
  requirementIds: string[];
}

export interface AssuranceModel {
  workspaceRoot: string;
  projects: Map<string, ProjectRecord>;
  requirements: Map<string, RequirementRecord>;
  evidenceFiles: Set<string>;
  behaviorTests: BehaviorTestRecord[];
  features: number;
  scenarios: number;
  errors: string[];
  warnings: string[];
  hash: string;
  /** Forge ids whose pipelines this checkout actually ships. See `EvidenceReference.forges`. */
  forges: Set<string>;
}

/**
 * Whether this checkout is expected to carry the evidence at all. Unscoped evidence always is;
 * forge-scoped evidence only where one of its forges is configured.
 */
export function evidenceApplies(
  evidence: EvidenceReference,
  forges: Set<string>,
): boolean {
  return (
    evidence.forges === undefined ||
    evidence.forges.some((forge) => forges.has(forge))
  );
}

export interface TraceReport {
  status: 'ok' | 'failed';
  sourceSha: string;
  generatedAt: string;
  specificationHash: string;
  totals: {
    projects: number;
    coveredProjects: number;
    behaviorTests: number;
    tracedBehaviorTests: number;
    features: number;
    scenarios: number;
    requirements: number;
    requirementsWithCucumberDisposition: number;
    acceptanceRequirements: number;
    cucumberNotApplicableRequirements: number;
    evidence: number;
  };
  evidenceByKind: Record<string, number>;
  cucumberAlternativeEvidenceByKind: Record<string, number>;
  requirements: Array<{
    id: string;
    capability: string;
    name: string;
    risk: RequirementRisk;
    profiles: EvidenceProfile[];
    cucumber: CucumberDisposition;
    evidence: number;
    projects: string[];
  }>;
  errors: string[];
  warnings: string[];
}

export interface ImpactReport {
  base: string;
  head: string;
  changedFiles: string[];
  requirementIds: string[];
  targets: string[];
  scripts: string[];
}

export interface VerificationRun {
  key: string;
  kind: 'target' | 'script';
  command: string;
  status: 'planned' | 'ok' | 'failed' | 'skipped';
  exitCode?: number;
  durationMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
}

export interface VerificationReport {
  status: 'planned' | 'ok' | 'failed';
  lane: EvidenceLane;
  workspaceState: 'planned' | 'clean' | 'dirty' | 'unavailable';
  sourceSha: string;
  generatedAt: string;
  specificationHash: string;
  base?: string;
  head?: string;
  requirementIds: string[];
  trace: TraceReport;
  runs: VerificationRun[];
}

const PROFILE_KINDS: Record<EvidenceProfile, EvidenceKind[]> = {
  acceptance: ['cucumber'],
  domain: ['vitest'],
  api: ['contract'],
  journey: ['playwright'],
  async: ['component'],
  persistence: ['component'],
  security: ['security'],
  operations: ['operations'],
  tooling: ['static', 'vitest'],
  documentation: ['documentation'],
  mutation: ['mutation'],
};

const RISK_VALUES = new Set<RequirementRisk>(['low', 'normal', 'high', 'critical']);
const PROFILE_VALUES = new Set<EvidenceProfile>(evidenceProfiles);
const KIND_VALUES = new Set<EvidenceKind>(evidenceKinds);
const LANE_VALUES = new Set<EvidenceLane>(evidenceLanes);
const REQUIREMENT_PATTERN =
  /^### Requirement:\s+\[(REQ-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{3})\]\s+(.+?)\s*$/gmu;
const TEST_REQUIREMENTS_PATTERN = /^\s*\/\/\s*@requirements\s+(.+?)\s*$/gmu;
const REQUIREMENT_ID_PATTERN = /\bREQ-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{3}\b/gu;
const SCENARIO_TAG_PATTERN = /@(SCN-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{2,3})\b/gu;
const BEHAVIOR_TEST_PATTERN =
  /(?:\.(?:spec|test)|(?:^|[._-])(?:component|e2e)-spec)\.(?:ts|tsx|mts|mjs)$/u;
/**
 * Matches a root script that runs the assurance verifier itself, either as the CLI verb
 * (`tooling spec verify`) or by delegating to another script (`pnpm run spec:verify`). Mapping
 * such a script as evidence makes verification spawn itself without a base case.
 */
const ASSURANCE_COMMAND_PATTERN = /\bspec[\s:]verify\b/u;
const CUCUMBER_REASON_PLACEHOLDERS = new Set([
  'covered elsewhere',
  'cucumber not needed',
  'no cucumber needed',
  'not applicable',
  'other tests cover this',
  'use other tests',
]);

export function loadAssuranceModel(workspaceRoot: string): AssuranceModel {
  const errors: string[] = [];
  const warnings: string[] = [];
  const projects = discoverProjects(workspaceRoot, errors);
  const rootPackage = readJsonFile<{
    scripts?: Record<string, string>;
  }>(resolve(workspaceRoot, 'package.json'), errors);
  const rootScriptCommands = Object.entries(rootPackage?.scripts ?? {});
  const rootScripts = new Set(rootScriptCommands.map(([name]) => name));
  const assuranceScripts = new Set(
    rootScriptCommands
      .filter(([, command]) => ASSURANCE_COMMAND_PATTERN.test(command))
      .map(([name]) => name),
  );
  const requirements = new Map<string, RequirementRecord>();
  const declaredForges = declaredForgeIds(workspaceRoot);
  const forges = new Set(configuredForges(workspaceRoot).map(({ id }) => id));
  const evidenceFiles = new Set<string>();
  const coveredProjects = new Set<string>();
  const specificationSources: string[] = [];
  const verificationValidator = createVerificationValidator(
    workspaceRoot,
    errors,
  );
  const specRoot = resolve(workspaceRoot, 'openspec/specs');
  const specFiles = existsSync(specRoot)
    ? findFiles(specRoot, (path) => path.endsWith(`${sep}spec.md`))
    : [];

  if (specFiles.length === 0) {
    errors.push('openspec/specs: no durable capability specifications found');
  }

  for (const absoluteSpecFile of specFiles) {
    const specFile = toWorkspacePath(workspaceRoot, absoluteSpecFile);
    const verificationFile = toWorkspacePath(
      workspaceRoot,
      resolve(dirname(absoluteSpecFile), 'verification.yaml'),
    );
    const specText = readFileSync(absoluteSpecFile, 'utf8');
    specificationSources.push(`${specFile}\n${specText}`);
    const declaredRequirements = parseRequirements(specText);

    if (declaredRequirements.length === 0) {
      errors.push(`${specFile}: no stable requirement headings found`);
    }

    if (!existsSync(resolve(workspaceRoot, verificationFile))) {
      errors.push(`${verificationFile}: missing verification sidecar for ${specFile}`);
      continue;
    }

    const verificationText = readFileSync(resolve(workspaceRoot, verificationFile), 'utf8');
    specificationSources.push(`${verificationFile}\n${verificationText}`);
    const verification = parseVerificationDocument(
      verificationFile,
      verificationText,
      errors,
      verificationValidator,
    );
    if (verification === null) continue;
    const capabilityDirectory = basename(dirname(absoluteSpecFile));
    if (verification.capability !== capabilityDirectory) {
      errors.push(
        `${verificationFile}: capability ${verification.capability} must match directory ${capabilityDirectory}`,
      );
    }

    const mapped = new Map<string, RequirementVerification>();
    for (const requirement of verification.requirements) {
      if (mapped.has(requirement.id)) {
        errors.push(
          `${verificationFile}: duplicate evidence mapping for ${requirement.id}`,
        );
      }
      mapped.set(requirement.id, requirement);
    }
    const declaredIds = new Set(declaredRequirements.map(({ id }) => id));

    for (const requirement of declaredRequirements) {
      const mapping = mapped.get(requirement.id);
      if (mapping === undefined) {
        errors.push(`${verificationFile}: missing evidence mapping for ${requirement.id}`);
        continue;
      }
      if (requirements.has(requirement.id)) {
        errors.push(`${specFile}: duplicate requirement ID ${requirement.id}`);
        continue;
      }

      validateRequirementMapping({
        workspaceRoot,
        verificationFile,
        requirement: mapping,
        owners: verification.owners,
        projects,
        rootScripts,
        assuranceScripts,
        errors,
        warnings,
        evidenceFiles,
        declaredForges,
        forges,
      });
      for (const projectName of mapping.projects) {
        if (!projects.has(projectName)) {
          errors.push(
            `${verificationFile}: ${requirement.id} references unknown Nx project ${projectName}`,
          );
        } else {
          coveredProjects.add(projectName);
        }
      }

      requirements.set(requirement.id, {
        ...mapping,
        capability: verification.capability,
        name: requirement.name,
        specFile,
        verificationFile,
        owners: verification.owners,
        projects: mapping.projects,
      });
    }

    for (const mappedId of mapped.keys()) {
      if (!declaredIds.has(mappedId)) {
        errors.push(`${verificationFile}: maps unknown requirement ${mappedId}`);
      }
    }
  }

  for (const projectName of projects.keys()) {
    if (!coveredProjects.has(projectName)) {
      errors.push(`openspec/specs: Nx project has no capability ownership: ${projectName}`);
    }
  }

  validateCucumberRationaleUniqueness(requirements, errors);

  const behaviorTests = validateBehaviorTestInventory(
    workspaceRoot,
    projects,
    requirements,
    errors,
  );
  const featureInventory = validateFeatureInventory(
    workspaceRoot,
    requirements,
    evidenceFiles,
    errors,
  );

  const hash = createHash('sha256')
    .update(specificationSources.sort().join('\n---\n'))
    .digest('hex');

  return {
    workspaceRoot,
    projects,
    requirements,
    evidenceFiles,
    behaviorTests,
    features: featureInventory.features,
    scenarios: featureInventory.scenarios,
    errors,
    warnings,
    hash,
    forges,
  };
}

export function createTraceReport(model: AssuranceModel): TraceReport {
  const evidenceByKind: Record<string, number> = {};
  const cucumberAlternativeEvidenceByKind: Record<string, number> = {};
  let evidence = 0;
  let acceptanceRequirements = 0;
  let cucumberNotApplicableRequirements = 0;
  const coveredProjects = new Set<string>();

  for (const requirement of model.requirements.values()) {
    for (const project of requirement.projects) coveredProjects.add(project);
    if (requirement.cucumber.disposition === 'acceptance') {
      acceptanceRequirements += 1;
    } else {
      cucumberNotApplicableRequirements += 1;
      for (const kind of requirement.cucumber.alternativeEvidence) {
        cucumberAlternativeEvidenceByKind[kind] =
          (cucumberAlternativeEvidenceByKind[kind] ?? 0) + 1;
      }
    }
    for (const reference of requirement.evidence) {
      evidence += 1;
      evidenceByKind[reference.kind] = (evidenceByKind[reference.kind] ?? 0) + 1;
    }
  }

  return {
    status: model.errors.length === 0 ? 'ok' : 'failed',
    sourceSha: sourceSha(model.workspaceRoot),
    generatedAt: new Date().toISOString(),
    specificationHash: model.hash,
    totals: {
      projects: model.projects.size,
      coveredProjects: coveredProjects.size,
      behaviorTests: model.behaviorTests.length,
      tracedBehaviorTests: model.behaviorTests.filter(
        ({ requirementIds }) => requirementIds.length > 0,
      ).length,
      features: model.features,
      scenarios: model.scenarios,
      requirements: model.requirements.size,
      requirementsWithCucumberDisposition:
        acceptanceRequirements + cucumberNotApplicableRequirements,
      acceptanceRequirements,
      cucumberNotApplicableRequirements,
      evidence,
    },
    evidenceByKind,
    cucumberAlternativeEvidenceByKind,
    requirements: [...model.requirements.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((requirement) => ({
        id: requirement.id,
        capability: requirement.capability,
        name: requirement.name,
        risk: requirement.risk,
        profiles: requirement.profiles,
        cucumber: requirement.cucumber,
        evidence: requirement.evidence.length,
        projects: requirement.projects,
      })),
    errors: model.errors,
    warnings: model.warnings,
  };
}

export function writeTraceReport(
  workspaceRoot: string,
  report: TraceReport,
  reportPath = 'test-results/spec-evidence/trace.json',
): void {
  writeJson(resolve(workspaceRoot, reportPath), report);
}

export function calculateImpact(
  model: AssuranceModel,
  base: string,
  head: string,
): ImpactReport {
  const result = run('git', ['diff', '--name-only', '--diff-filter=ACMRD', base, head], {
    cwd: model.workspaceRoot,
  });
  if (result.status !== 0) {
    throw new Error(
      `git diff failed for ${base}..${head}: ${result.stderr || result.error || result.stdout}`,
    );
  }

  const changedFiles = result.stdout
    .split(/\r?\n/u)
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);
  return calculateImpactFromChangedFiles(model, base, head, changedFiles);
}

export function calculateImpactFromChangedFiles(
  model: AssuranceModel,
  base: string,
  head: string,
  files: Iterable<string>,
): ImpactReport {
  const changedFiles = [...files]
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);
  const projectRoots = [...model.projects.values()].map(({ root }) => root.replace(/\/+$/u, ''));
  const globalChange = changedFiles.some((file) => isRepositoryGlobalChange(file, projectRoots));
  const requirementIds = new Set<string>();

  for (const requirement of model.requirements.values()) {
    const directFiles = new Set([
      requirement.specFile,
      requirement.verificationFile,
      ...requirement.evidence.map(({ file }) => file),
    ]);
    const projectRoots = requirement.projects
      .map((project) => model.projects.get(project)?.root)
      .filter((root): root is string => root !== undefined);
    if (
      globalChange ||
      changedFiles.some(
        (file) =>
          directFiles.has(file) ||
          projectRoots.some((root) => file === root || file.startsWith(`${root}/`)),
      )
    ) {
      requirementIds.add(requirement.id);
    }
  }

  const executables = collectExecutables(model, requirementIds);
  return {
    base,
    head,
    changedFiles,
    requirementIds: [...requirementIds].sort(),
    targets: executables.targets,
    scripts: executables.scripts,
  };
}

function isRepositoryGlobalChange(file: string, projectRoots: readonly string[]): boolean {
  if (file.startsWith('openspec/specs/')) {
    return false;
  }
  if (
    [
      'packages/tooling/src/',
      'packages/tooling/config/',
      'packages/tooling/scripts/',
      'packages/tooling/AGENTS.md',
      'packages/tooling/README.md',
      'packages/tooling/package.json',
      'packages/tooling/project.json',
      'packages/tooling/tsconfig.json',
    ].some((prefix) => file === prefix || file.startsWith(prefix))
  ) {
    return true;
  }
  return !projectRoots.some((root) => file === root || file.startsWith(`${root}/`));
}

export function verifyRequirements(options: {
  model: AssuranceModel;
  requirementIds: Iterable<string>;
  dryRun: boolean;
  lane: EvidenceLane;
  base?: string;
  head?: string;
  reportPath?: string;
}): VerificationReport {
  const { model, dryRun, lane, base, head } = options;
  const requirementIds = [...new Set(options.requirementIds)].sort();
  const trace = createTraceReport(model);
  const executables = collectExecutables(model, requirementIds, lane);
  const runs: VerificationRun[] = [];
  const workspaceState = dryRun
    ? 'planned'
    : verificationWorkspaceState(model.workspaceRoot);
  const checkedOutSha = sourceSha(model.workspaceRoot);
  const headError =
    dryRun || head === undefined
      ? null
      : headAttributionError(model.workspaceRoot, head, checkedOutSha);

  if (workspaceState === 'dirty' || workspaceState === 'unavailable') {
    runs.push(
      {
        key: 'exact-source-worktree',
        kind: 'script',
        command: 'git status --porcelain',
        status: 'failed',
        stderrTail:
          workspaceState === 'dirty'
            ? 'The worktree is dirty; commit the exact source before collecting passing evidence.'
            : 'Git worktree state could not be established.',
      },
    );
  } else if (headError !== null) {
    runs.push(
      {
        key: 'exact-source-head',
        kind: 'script',
        command: `git rev-parse --verify ${head}^{commit}`,
        status: 'failed',
        stderrTail: headError,
      },
    );
  } else {
    for (const target of executables.targets) {
      runs.push(
        executeEvidenceCommand({
          workspaceRoot: model.workspaceRoot,
          key: target,
          kind: 'target',
          command: ['pnpm', 'exec', 'nx', 'run', target],
          dryRun,
        }),
      );
    }
    for (const script of executables.scripts) {
      runs.push(
        executeEvidenceCommand({
          workspaceRoot: model.workspaceRoot,
          key: script,
          kind: 'script',
          command: ['pnpm', 'run', script],
          dryRun,
        }),
      );
    }
  }

  for (const evidence of executables.skipped) {
    runs.push({
      key: `not-applicable:${evidence.command}`,
      kind: evidence.kind,
      command: evidence.command,
      status: 'skipped',
      stdoutTail: `forge ${evidence.forges.join(', ')} not configured: ${evidence.reason}`,
    });
  }

  const failed = trace.status === 'failed' || runs.some(({ status }) => status === 'failed');
  const report: VerificationReport = {
    status: dryRun ? 'planned' : failed ? 'failed' : 'ok',
    lane,
    workspaceState,
    sourceSha: checkedOutSha,
    generatedAt: new Date().toISOString(),
    specificationHash: model.hash,
    ...(base === undefined ? {} : { base }),
    ...(head === undefined ? {} : { head }),
    requirementIds,
    trace,
    runs,
  };
  const reportPath = options.reportPath ?? 'test-results/spec-evidence/assurance.json';
  writeJson(resolve(model.workspaceRoot, reportPath), report);
  const markdownPath = reportPath.replace(/\.json$/u, '.md');
  ensureDir(dirname(resolve(model.workspaceRoot, markdownPath)));
  writeFileSync(
    resolve(model.workspaceRoot, markdownPath),
    renderVerificationMarkdown(report),
  );
  return report;
}

export function renderVerificationMarkdown(report: VerificationReport): string {
  const lines = [
    '# Specification assurance',
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Evidence lane: \`${report.lane}\``,
    `- Workspace state: \`${report.workspaceState}\``,
    `- Source SHA: \`${report.sourceSha}\``,
    `- Specification hash: \`${report.specificationHash}\``,
    `- Requirements: ${report.requirementIds.length}`,
    `- Projects covered: ${report.trace.totals.coveredProjects}/${report.trace.totals.projects}`,
    `- Behavior tests traced: ${report.trace.totals.tracedBehaviorTests}/${report.trace.totals.behaviorTests}`,
    `- Gherkin features/scenarios: ${report.trace.totals.features}/${report.trace.totals.scenarios}`,
    `- Cucumber dispositions: ${report.trace.totals.requirementsWithCucumberDisposition}/${report.trace.totals.requirements} (${report.trace.totals.acceptanceRequirements} acceptance, ${report.trace.totals.cucumberNotApplicableRequirements} not applicable)`,
    `- Evidence references: ${report.trace.totals.evidence}`,
    '',
    '## Executed evidence',
    '',
    '| Evidence | Kind | Status | Duration |',
    '| --- | --- | --- | --- |',
  ];
  if (report.runs.length === 0) {
    lines.push('| None required | - | ok | - |');
  } else {
    for (const evidenceRun of report.runs) {
      lines.push(
        `| \`${evidenceRun.key}\` | ${evidenceRun.kind} | ${evidenceRun.status} | ${
          evidenceRun.durationMs === undefined ? '-' : `${evidenceRun.durationMs} ms`
        } |`,
      );
    }
  }
  if (report.trace.errors.length > 0) {
    lines.push('', '## Trace errors', '');
    for (const error of report.trace.errors) lines.push(`- ${error}`);
  }
  if (report.trace.warnings.length > 0) {
    lines.push('', '## Trace warnings', '');
    for (const warning of report.trace.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

export function runOpenSpecValidation(workspaceRoot: string): RunResult {
  return run(
    'pnpm',
    [
      'exec',
      'openspec',
      'validate',
      '--all',
      '--strict',
      '--no-interactive',
      '--json',
    ],
    {
      cwd: workspaceRoot,
      env: { OPENSPEC_TELEMETRY: '0' },
    },
  );
}

function validateRequirementMapping(options: {
  workspaceRoot: string;
  verificationFile: string;
  requirement: RequirementVerification;
  owners: VerificationDocument['owners'];
  projects: Map<string, ProjectRecord>;
  rootScripts: Set<string>;
  assuranceScripts: Set<string>;
  errors: string[];
  warnings: string[];
  evidenceFiles: Set<string>;
  declaredForges: Set<string> | null;
  forges: Set<string>;
}): void {
  const {
    workspaceRoot,
    verificationFile,
    requirement,
    owners,
    projects,
    rootScripts,
    assuranceScripts,
    errors,
    evidenceFiles,
    declaredForges,
    forges,
  } = options;
  const prefix = `${verificationFile}: ${requirement.id}`;

  if (requirement.projects.length === 0) {
    errors.push(`${prefix}: at least one owned Nx project is required`);
  }
  if (!RISK_VALUES.has(requirement.risk)) {
    errors.push(`${prefix}: invalid risk ${String(requirement.risk)}`);
  }
  if (requirement.profiles.length === 0) {
    errors.push(`${prefix}: at least one evidence profile is required`);
  }
  const requirementEvidenceKinds = new Set(
    requirement.evidence.map(({ kind }) => kind),
  );
  for (const profile of requirement.profiles) {
    if (!PROFILE_VALUES.has(profile)) {
      errors.push(`${prefix}: invalid evidence profile ${String(profile)}`);
      continue;
    }
    for (const requiredKind of PROFILE_KINDS[profile]) {
      if (!requirementEvidenceKinds.has(requiredKind)) {
        errors.push(`${prefix}: profile ${profile} requires ${requiredKind} evidence`);
      }
    }
  }
  if (requirement.cucumber.disposition === 'acceptance') {
    if (!requirement.profiles.includes('acceptance')) {
      errors.push(`${prefix}: Cucumber acceptance requires the acceptance profile`);
    }
    if (!requirementEvidenceKinds.has('cucumber')) {
      errors.push(`${prefix}: Cucumber acceptance requires cucumber evidence`);
    }
  } else {
    if (requirement.profiles.includes('acceptance')) {
      errors.push(
        `${prefix}: Cucumber not-applicable forbids the acceptance profile`,
      );
    }
    if (requirementEvidenceKinds.has('cucumber')) {
      errors.push(`${prefix}: Cucumber not-applicable forbids cucumber evidence`);
    }
    const normalizedReason = normalizeCucumberReason(
      requirement.cucumber.reason,
    );
    if (requirement.cucumber.reason.trim().length < 12) {
      errors.push(
        `${prefix}: Cucumber not-applicable reason must contain at least 12 non-whitespace characters`,
      );
    } else if (CUCUMBER_REASON_PLACEHOLDERS.has(normalizedReason)) {
      errors.push(
        `${prefix}: Cucumber not-applicable reason must be requirement-specific, not placeholder text`,
      );
    }
    for (const kind of requirement.cucumber.alternativeEvidence) {
      if (!requirementEvidenceKinds.has(kind)) {
        errors.push(
          `${prefix}: Cucumber alternative ${kind} is not mapped by requirement evidence`,
        );
      }
    }
  }
  if (requirement.evidence.length === 0) {
    errors.push(`${prefix}: at least one evidence reference is required`);
  }
  if (
    (requirement.risk === 'high' || requirement.risk === 'critical') &&
    owners.product === owners.verification
  ) {
    errors.push(`${prefix}: high-risk requirements need an independent verification owner`);
  }
  if (requirement.profiles.includes('security') && !owners.security) {
    errors.push(`${prefix}: security profile requires a security owner`);
  }
  if (requirement.profiles.includes('operations') && !owners.operations) {
    errors.push(`${prefix}: operations profile requires an operations owner`);
  }

  for (const evidence of requirement.evidence) {
    if (!KIND_VALUES.has(evidence.kind)) {
      errors.push(`${prefix}: invalid evidence kind ${String(evidence.kind)}`);
      continue;
    }
    if (!evidence.file) {
      errors.push(`${prefix}: ${evidence.kind} evidence requires a source file`);
      continue;
    }
    if (evidence.lanes.length === 0) {
      errors.push(`${prefix}: ${evidence.kind} evidence requires at least one lane`);
    }
    for (const lane of evidence.lanes) {
      if (!LANE_VALUES.has(lane)) {
        errors.push(`${prefix}: invalid evidence lane ${String(lane)}`);
      }
    }
    if (evidence.forges !== undefined && declaredForges !== null) {
      for (const forge of evidence.forges) {
        if (!declaredForges.has(forge)) {
          errors.push(`${prefix}: evidence references unknown forge "${forge}"`);
        }
      }
    }
    // Everything below asserts that a file, a target or a script is present. A product that
    // dropped this forge deleted all three along with its pipelines, and the evidence is
    // recorded as not-applicable rather than missing. `verifyRequirements` reports the skip.
    if (!evidenceApplies(evidence, forges)) continue;
    const absoluteEvidenceFile = safeWorkspacePath(
      workspaceRoot,
      evidence.file,
      `${prefix}: evidence file`,
      errors,
    );
    if (absoluteEvidenceFile === null) continue;
    evidenceFiles.add(evidence.file.replaceAll('\\', '/'));
    if (!existsSync(absoluteEvidenceFile) || !statSync(absoluteEvidenceFile).isFile()) {
      errors.push(`${prefix}: evidence file does not exist: ${evidence.file}`);
      continue;
    }
    const evidenceText = readFileSync(absoluteEvidenceFile, 'utf8');
    if (!evidenceText.includes(requirement.id)) {
      errors.push(
        `${prefix}: evidence file must explicitly reference the requirement ID: ${evidence.file}`,
      );
    }
    if (evidence.kind === 'cucumber') {
      if (!evidence.scenario) {
        errors.push(`${prefix}: Cucumber evidence requires a stable scenario ID`);
      } else if (!evidenceText.includes(`@${evidence.scenario}`)) {
        errors.push(
          `${prefix}: Cucumber feature does not contain @${evidence.scenario}: ${evidence.file}`,
        );
      }
      if (!evidenceText.includes(`@${requirement.id}`)) {
        errors.push(
          `${prefix}: Cucumber feature does not contain @${requirement.id}: ${evidence.file}`,
        );
      }
    }
    if (evidence.target && evidence.script) {
      errors.push(`${prefix}: evidence cannot declare both target and script`);
    } else if (evidence.target) {
      const separatorIndex = evidence.target.lastIndexOf(':');
      if (separatorIndex <= 0 || separatorIndex === evidence.target.length - 1) {
        errors.push(`${prefix}: invalid Nx target ${evidence.target}`);
      } else {
        const projectName = evidence.target.slice(0, separatorIndex);
        const targetName = evidence.target.slice(separatorIndex + 1);
        const project = projects.get(projectName);
        if (project === undefined) {
          errors.push(`${prefix}: target references unknown project ${projectName}`);
        } else if (!project.targets.has(targetName)) {
          errors.push(`${prefix}: project ${projectName} has no ${targetName} target`);
        }
      }
    } else if (evidence.script) {
      if (!rootScripts.has(evidence.script)) {
        errors.push(`${prefix}: unknown root package script ${evidence.script}`);
      } else if (assuranceScripts.has(evidence.script)) {
        errors.push(
          `${prefix}: evidence script ${evidence.script} re-enters specification assurance; evidence must be an independent command`,
        );
      }
    } else if (evidence.kind !== 'documentation') {
      errors.push(`${prefix}: ${evidence.kind} evidence requires target or script`);
    }
  }
}

function normalizeCucumberReason(reason: string): string {
  return reason.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function validateCucumberRationaleUniqueness(
  requirements: Map<string, RequirementRecord>,
  errors: string[],
): void {
  const ownersByReason = new Map<string, string>();
  for (const requirement of requirements.values()) {
    if (requirement.cucumber.disposition !== 'not-applicable') continue;
    const normalizedReason = normalizeCucumberReason(requirement.cucumber.reason);
    const existingRequirement = ownersByReason.get(normalizedReason);
    if (existingRequirement !== undefined) {
      errors.push(
        `${requirement.verificationFile}: ${requirement.id}: Cucumber not-applicable reason duplicates ${existingRequirement}; provide a requirement-specific rationale`,
      );
    } else {
      ownersByReason.set(normalizedReason, requirement.id);
    }
  }
}

function validateBehaviorTestInventory(
  workspaceRoot: string,
  projects: Map<string, ProjectRecord>,
  requirements: Map<string, RequirementRecord>,
  errors: string[],
): BehaviorTestRecord[] {
  const inventoryRoots = [
    'apps',
    'libs',
    'packages',
    'i18n',
    'scripts',
    'deploy',
    'docker',
    '.github',
  ]
    .map((directory) => resolve(workspaceRoot, directory))
    .filter(existsSync);
  const projectRoots = [...projects.values()]
    .map((project) => ({
      name: project.name,
      root: project.root.replaceAll('\\', '/').replace(/\/+$/u, ''),
    }))
    .sort((left, right) => right.root.length - left.root.length);
  const testFiles = inventoryRoots.flatMap((root) =>
    findFiles(root, (path) => BEHAVIOR_TEST_PATTERN.test(basename(path))),
  );
  const records: BehaviorTestRecord[] = [];

  for (const absoluteFile of [...new Set(testFiles)].sort()) {
    const file = toWorkspacePath(workspaceRoot, absoluteFile);
    const text = readFileSync(absoluteFile, 'utf8');
    const markerLines = [...text.matchAll(TEST_REQUIREMENTS_PATTERN)];
    const requirementIds = [
      ...new Set(
        markerLines.flatMap((marker) => [
          ...(marker[1] ?? '').matchAll(REQUIREMENT_ID_PATTERN),
        ]).flatMap((match) => (match[0] ? [match[0]] : [])),
      ),
    ].sort();
    const project = projectRoots.find(
      ({ root }) => file === root || file.startsWith(`${root}/`),
    )?.name;

    if (markerLines.length === 0) {
      errors.push(
        `${file}: executable behavior test requires a // @requirements REQ-... marker`,
      );
    } else if (requirementIds.length === 0) {
      errors.push(`${file}: @requirements marker contains no valid requirement ID`);
    }

    for (const requirementId of requirementIds) {
      const requirement = requirements.get(requirementId);
      if (requirement === undefined) {
        errors.push(`${file}: @requirements references unknown ${requirementId}`);
        continue;
      }
      if (project !== undefined && !requirement.projects.includes(project)) {
        errors.push(
          `${file}: ${requirementId} does not own Nx project ${project}`,
        );
      }
    }

    records.push({
      file,
      ...(project === undefined ? {} : { project }),
      requirementIds,
    });
  }

  return records;
}

function validateFeatureInventory(
  workspaceRoot: string,
  requirements: Map<string, RequirementRecord>,
  evidenceFiles: Set<string>,
  errors: string[],
): { features: number; scenarios: number } {
  const featureRoot = resolve(workspaceRoot, 'apps/e2e/acceptance/features');
  if (!existsSync(featureRoot)) return { features: 0, scenarios: 0 };
  const featureFiles = findFiles(featureRoot, (path) => path.endsWith('.feature'));
  const scenarioIds = new Set<string>();
  const mappedScenarioIds = new Set(
    [...requirements.values()].flatMap((requirement) =>
      requirement.evidence.flatMap((evidence) =>
        evidence.kind === 'cucumber' && evidence.scenario
          ? [evidence.scenario]
          : [],
      ),
    ),
  );
  for (const absoluteFile of featureFiles) {
    const file = toWorkspacePath(workspaceRoot, absoluteFile);
    const text = readFileSync(absoluteFile, 'utf8');
    if (!evidenceFiles.has(file)) {
      errors.push(`${file}: feature is not referenced by any requirement evidence`);
    }
    for (const match of text.matchAll(/@(REQ-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{3})\b/gu)) {
      const requirementId = match[1];
      if (requirementId && !requirements.has(requirementId)) {
        errors.push(`${file}: references unknown requirement ${requirementId}`);
      }
    }
    for (const match of text.matchAll(SCENARIO_TAG_PATTERN)) {
      const scenarioId = match[1];
      if (!scenarioId) continue;
      if (scenarioIds.has(scenarioId)) errors.push(`${file}: duplicate scenario ID ${scenarioId}`);
      scenarioIds.add(scenarioId);
      if (!mappedScenarioIds.has(scenarioId)) {
        errors.push(
          `${file}: scenario ${scenarioId} is not mapped by any requirement evidence`,
        );
      }
    }
  }
  return { features: featureFiles.length, scenarios: scenarioIds.size };
}

function discoverProjects(
  workspaceRoot: string,
  errors: string[],
): Map<string, ProjectRecord> {
  const projects = new Map<string, ProjectRecord>();
  const projectRoots = new Set<string>();
  const roots = ['apps', 'libs', 'packages', 'i18n']
    .map((directory) => resolve(workspaceRoot, directory))
    .filter(existsSync);

  for (const root of roots) {
    for (const projectFile of findFiles(root, (path) => path.endsWith(`${sep}project.json`))) {
      const parsed = readJsonFile<{
        name?: string;
        targets?: Record<string, unknown>;
      }>(projectFile, errors);
      if (!parsed?.name) {
        errors.push(`${toWorkspacePath(workspaceRoot, projectFile)}: Nx project requires a name`);
        continue;
      }
      if (projects.has(parsed.name)) {
        errors.push(
          `${toWorkspacePath(workspaceRoot, projectFile)}: duplicate Nx project name ${parsed.name}`,
        );
        continue;
      }
      projects.set(parsed.name, {
        name: parsed.name,
        root: toWorkspacePath(workspaceRoot, dirname(projectFile)),
        targets: new Set(Object.keys(parsed.targets ?? {})),
      });
      projectRoots.add(dirname(projectFile));
    }
    for (const packageFile of findFiles(root, (path) => path.endsWith(`${sep}package.json`))) {
      if (projectRoots.has(dirname(packageFile))) continue;
      const parsed = readJsonFile<{
        name?: string;
        scripts?: Record<string, string>;
      }>(packageFile, errors);
      if (!parsed?.name) continue;
      if (projects.has(parsed.name)) {
        errors.push(
          `${toWorkspacePath(workspaceRoot, packageFile)}: duplicate project name ${parsed.name}`,
        );
        continue;
      }
      projects.set(parsed.name, {
        name: parsed.name,
        root: toWorkspacePath(workspaceRoot, dirname(packageFile)),
        targets: new Set(Object.keys(parsed.scripts ?? {})),
      });
    }
  }
  return projects;
}

function parseVerificationDocument(
  file: string,
  text: string,
  errors: string[],
  validator: ValidateFunction<unknown> | null,
): VerificationDocument | null {
  let value: unknown;
  try {
    value = parseYaml(text);
  } catch (error) {
    errors.push(`${file}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  if (!isRecord(value)) {
    errors.push(`${file}: verification document must be an object`);
    return null;
  }
  if (validator === null || !validator(value)) {
    for (const issue of validator?.errors ?? []) {
      errors.push(
        `${file}${issue.instancePath || ''}: ${issue.message ?? 'schema validation failed'}`,
      );
    }
    return null;
  }
  if (value.version !== evidenceSidecarVersion)
    errors.push(`${file}: version must be ${evidenceSidecarVersion}`);
  if (typeof value.capability !== 'string' || value.capability.trim() === '') {
    errors.push(`${file}: capability is required`);
  }
  if (!isRecord(value.owners)) errors.push(`${file}: owners object is required`);
  const owners = isRecord(value.owners) ? value.owners : {};
  for (const owner of ['product', 'verification']) {
    if (typeof owners[owner] !== 'string' || owners[owner].trim() === '') {
      errors.push(`${file}: owners.${owner} is required`);
    }
  }
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) {
    errors.push(`${file}: requirements must list at least one mapping`);
  }

  return {
    version: evidenceSidecarVersion,
    capability: typeof value.capability === 'string' ? value.capability : '',
    owners: {
      product: typeof owners.product === 'string' ? owners.product : '',
      verification: typeof owners.verification === 'string' ? owners.verification : '',
      ...(typeof owners.security === 'string' ? { security: owners.security } : {}),
      ...(typeof owners.operations === 'string' ? { operations: owners.operations } : {}),
    },
    requirements: Array.isArray(value.requirements)
      ? value.requirements
          .filter(isRecord)
          .map((requirement) => ({
            id: typeof requirement.id === 'string' ? requirement.id : '',
            projects: isStringArray(requirement.projects)
              ? requirement.projects
              : [],
            risk:
              typeof requirement.risk === 'string'
                ? (requirement.risk as RequirementRisk)
                : 'normal',
            profiles: isStringArray(requirement.profiles)
              ? (requirement.profiles as EvidenceProfile[])
              : [],
            cucumber: parseCucumberDisposition(requirement.cucumber),
            evidence: Array.isArray(requirement.evidence)
              ? requirement.evidence.filter(isRecord).map((evidence) => ({
                  kind:
                    typeof evidence.kind === 'string'
                      ? (evidence.kind as EvidenceKind)
                      : 'documentation',
                  file: typeof evidence.file === 'string' ? evidence.file : '',
                  lanes: isStringArray(evidence.lanes)
                    ? (evidence.lanes as EvidenceLane[])
                    : [],
                  ...(typeof evidence.target === 'string'
                    ? { target: evidence.target }
                    : {}),
                  ...(typeof evidence.script === 'string'
                    ? { script: evidence.script }
                    : {}),
                  ...(typeof evidence.scenario === 'string'
                    ? { scenario: evidence.scenario }
                    : {}),
                  ...(typeof evidence.description === 'string'
                    ? { description: evidence.description }
                    : {}),
                  ...(isStringArray(evidence.forges)
                    ? { forges: evidence.forges }
                    : {}),
                  ...(typeof evidence.reason === 'string'
                    ? { reason: evidence.reason }
                    : {}),
                }))
              : [],
          }))
      : [],
  };
}

function parseCucumberDisposition(value: unknown): CucumberDisposition {
  if (!isRecord(value) || value.disposition === 'acceptance') {
    return { disposition: 'acceptance' };
  }
  return {
    disposition: 'not-applicable',
    reason: typeof value.reason === 'string' ? value.reason : '',
    alternativeEvidence: isStringArray(value.alternativeEvidence)
      ? (value.alternativeEvidence as AlternativeEvidenceKind[])
      : [],
  };
}

function createVerificationValidator(
  workspaceRoot: string,
  errors: string[],
): ValidateFunction<unknown> | null {
  const schemaFile = resolve(
    workspaceRoot,
    'packages/tooling/config/spec-evidence.schema.json',
  );
  const schema = readJsonFile<Record<string, unknown>>(schemaFile, errors);
  if (schema === null) return null;
  try {
    return new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
  } catch (error) {
    errors.push(
      `packages/tooling/config/spec-evidence.schema.json: could not compile schema: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function parseRequirements(text: string): Array<{ id: string; name: string }> {
  return [...text.matchAll(REQUIREMENT_PATTERN)].flatMap((match) =>
    match[1] && match[2] ? [{ id: match[1], name: match[2] }] : [],
  );
}

function collectExecutables(
  model: AssuranceModel,
  requirementIds: Iterable<string>,
  lane?: EvidenceLane,
): { targets: string[]; scripts: string[]; skipped: SkippedEvidence[] } {
  const targets = new Set<string>();
  const scripts = new Set<string>();
  const skipped = new Map<string, SkippedEvidence>();
  for (const id of requirementIds) {
    const requirement = model.requirements.get(id);
    if (!requirement) continue;
    for (const evidence of requirement.evidence) {
      if (lane !== undefined && !evidence.lanes.includes(lane)) continue;
      const command = evidence.target ?? evidence.script;
      if (!evidenceApplies(evidence, model.forges)) {
        if (command !== undefined && !skipped.has(command)) {
          skipped.set(command, {
            command,
            kind: evidence.target ? 'target' : 'script',
            forges: evidence.forges ?? [],
            reason: evidence.reason ?? '',
          });
        }
        continue;
      }
      if (evidence.target) targets.add(evidence.target);
      if (evidence.script) scripts.add(evidence.script);
    }
  }
  // A command shared with unscoped evidence still runs; only a command nothing else needs is
  // reported as skipped, so a partially-scoped requirement never loses coverage.
  for (const command of [...skipped.keys()]) {
    if (targets.has(command) || scripts.has(command)) skipped.delete(command);
  }
  return {
    targets: [...targets].sort(),
    scripts: [...scripts].sort(),
    skipped: [...skipped.values()].sort((left, right) =>
      left.command.localeCompare(right.command),
    ),
  };
}

interface SkippedEvidence {
  command: string;
  kind: VerificationRun['kind'];
  forges: string[];
  reason: string;
}

function verificationWorkspaceState(
  workspaceRoot: string,
): 'clean' | 'dirty' | 'unavailable' {
  const result = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: workspaceRoot,
  });
  if (result.status !== 0) return 'unavailable';
  return result.stdout.trim() === '' ? 'clean' : 'dirty';
}

function executeEvidenceCommand(options: {
  workspaceRoot: string;
  key: string;
  kind: VerificationRun['kind'];
  command: string[];
  dryRun: boolean;
}): VerificationRun {
  const [program, ...args] = options.command;
  const printable = options.command.join(' ');
  if (!program || options.dryRun) {
    return {
      key: options.key,
      kind: options.kind,
      command: printable,
      status: 'planned',
    };
  }
  const started = performance.now();
  const result = run(program, args, {
    cwd: options.workspaceRoot,
    env: {
      CI: process.env.CI ?? 'true',
      NX_DAEMON: 'false',
      OPENSPEC_TELEMETRY: '0',
    },
  });
  return {
    key: options.key,
    kind: options.kind,
    command: printable,
    status: result.status === 0 ? 'ok' : 'failed',
    exitCode: result.status,
    durationMs: Math.round(performance.now() - started),
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr || result.error || ''),
  };
}

function resolveRevision(workspaceRoot: string, revision: string): string | null {
  const result = run(
    'git',
    ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`],
    { cwd: workspaceRoot },
  );
  const resolved = result.stdout.trim();
  return result.status === 0 && resolved !== '' ? resolved : null;
}

function sourceSha(workspaceRoot: string): string {
  return resolveRevision(workspaceRoot, 'HEAD') ?? 'unknown';
}

/**
 * A dossier records `head` as the commit its evidence describes, but the evidence is always
 * collected from the checked-out tree. Without this comparison a passing report can be filed
 * against a commit that was never built, which is precisely what REQ-ASSURANCE-FRESHNESS-002
 * forbids.
 */
function headAttributionError(
  workspaceRoot: string,
  head: string,
  checkedOutSha: string,
): string | null {
  const resolved = resolveRevision(workspaceRoot, head);
  if (resolved === null) {
    return `--head ${head} does not resolve to a commit in this workspace.`;
  }
  if (checkedOutSha === 'unknown') {
    return 'The checked-out commit could not be established, so evidence cannot be attributed to --head.';
  }
  if (resolved !== checkedOutSha) {
    return `--head ${head} resolves to ${resolved} but ${checkedOutSha} is checked out; evidence would be attributed to a commit it was not collected from.`;
  }
  return null;
}

function safeWorkspacePath(
  workspaceRoot: string,
  path: string,
  label: string,
  errors: string[],
): string | null {
  const absolute = resolve(workspaceRoot, path);
  const relativePath = relative(workspaceRoot, absolute);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '' ||
    relativePath.startsWith(sep)
  ) {
    errors.push(`${label} escapes the workspace: ${path}`);
    return null;
  }
  return absolute;
}

function toWorkspacePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).replaceAll('\\', '/');
}

function findFiles(root: string, predicate: (path: string) => boolean): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        ['node_modules', '.git', 'dist', 'coverage', 'test-results'].includes(entry.name)
      ) {
        continue;
      }
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && predicate(absolute)) files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
}

function readJsonFile<T>(file: string, errors: string[]): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (error) {
    errors.push(
      `${file}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function tail(value: string, max = 4000): string {
  return value.length > max ? value.slice(-max) : value;
}

export function writeVerificationMarkdown(
  workspaceRoot: string,
  reportPath: string,
  outputPath: string,
): void {
  const report = JSON.parse(
    readFileSync(resolve(workspaceRoot, reportPath), 'utf8'),
  ) as VerificationReport;
  const absoluteOutput = resolve(workspaceRoot, outputPath);
  ensureDir(dirname(absoluteOutput));
  writeFileSync(absoluteOutput, renderVerificationMarkdown(report));
}
