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

export interface EvidenceReference {
  kind: EvidenceKind;
  file: string;
  lanes: EvidenceLane[];
  target?: string;
  script?: string;
  scenario?: string;
  description?: string;
}

export interface RequirementVerification {
  id: string;
  risk: RequirementRisk;
  profiles: EvidenceProfile[];
  evidence: EvidenceReference[];
}

export interface VerificationDocument {
  version: 1;
  capability: string;
  owners: {
    product: string;
    verification: string;
    security?: string;
    operations?: string;
  };
  projects: string[];
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

export interface AssuranceModel {
  workspaceRoot: string;
  projects: Map<string, ProjectRecord>;
  requirements: Map<string, RequirementRecord>;
  evidenceFiles: Set<string>;
  errors: string[];
  warnings: string[];
  hash: string;
}

export interface TraceReport {
  status: 'ok' | 'failed';
  sourceSha: string;
  generatedAt: string;
  specificationHash: string;
  totals: {
    projects: number;
    coveredProjects: number;
    requirements: number;
    evidence: number;
  };
  evidenceByKind: Record<string, number>;
  requirements: Array<{
    id: string;
    capability: string;
    name: string;
    risk: RequirementRisk;
    profiles: EvidenceProfile[];
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
  status: 'planned' | 'ok' | 'failed';
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
const SCENARIO_TAG_PATTERN = /@(SCN-[A-Z0-9]+(?:-[A-Z0-9]+)+-\d{2,3})\b/gu;

export function loadAssuranceModel(workspaceRoot: string): AssuranceModel {
  const errors: string[] = [];
  const warnings: string[] = [];
  const projects = discoverProjects(workspaceRoot, errors);
  const rootPackage = readJsonFile<{
    scripts?: Record<string, string>;
  }>(resolve(workspaceRoot, 'package.json'), errors);
  const rootScripts = new Set(Object.keys(rootPackage?.scripts ?? {}));
  const requirements = new Map<string, RequirementRecord>();
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

    for (const projectName of verification.projects) {
      if (!projects.has(projectName)) {
        errors.push(`${verificationFile}: references unknown Nx project ${projectName}`);
      } else {
        coveredProjects.add(projectName);
      }
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
        errors,
        warnings,
        evidenceFiles,
      });

      requirements.set(requirement.id, {
        ...mapping,
        capability: verification.capability,
        name: requirement.name,
        specFile,
        verificationFile,
        owners: verification.owners,
        projects: verification.projects,
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

  validateFeatureInventory(workspaceRoot, requirements, evidenceFiles, errors);

  const hash = createHash('sha256')
    .update(specificationSources.sort().join('\n---\n'))
    .digest('hex');

  return {
    workspaceRoot,
    projects,
    requirements,
    evidenceFiles,
    errors,
    warnings,
    hash,
  };
}

export function createTraceReport(model: AssuranceModel): TraceReport {
  const evidenceByKind: Record<string, number> = {};
  let evidence = 0;
  const coveredProjects = new Set<string>();

  for (const requirement of model.requirements.values()) {
    for (const project of requirement.projects) coveredProjects.add(project);
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
      requirements: model.requirements.size,
      evidence,
    },
    evidenceByKind,
    requirements: [...model.requirements.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((requirement) => ({
        id: requirement.id,
        capability: requirement.capability,
        name: requirement.name,
        risk: requirement.risk,
        profiles: requirement.profiles,
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
  const result = run('git', ['diff', '--name-only', '--diff-filter=ACMR', base, head], {
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
  const globalChange = changedFiles.some((file) =>
    [
      'openspec/config.yaml',
      'openspec/schemas/',
      'packages/tooling/src/commands/spec/',
      'packages/tooling/config/spec-evidence.schema.json',
    ].some((prefix) => file === prefix || file.startsWith(prefix)),
  );
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

  const failed = trace.status === 'failed' || runs.some(({ status }) => status === 'failed');
  const report: VerificationReport = {
    status: dryRun ? 'planned' : failed ? 'failed' : 'ok',
    lane,
    workspaceState,
    sourceSha: sourceSha(model.workspaceRoot),
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
  errors: string[];
  warnings: string[];
  evidenceFiles: Set<string>;
}): void {
  const {
    workspaceRoot,
    verificationFile,
    requirement,
    owners,
    projects,
    rootScripts,
    errors,
    evidenceFiles,
  } = options;
  const prefix = `${verificationFile}: ${requirement.id}`;

  if (!RISK_VALUES.has(requirement.risk)) {
    errors.push(`${prefix}: invalid risk ${String(requirement.risk)}`);
  }
  if (requirement.profiles.length === 0) {
    errors.push(`${prefix}: at least one evidence profile is required`);
  }
  for (const profile of requirement.profiles) {
    if (!PROFILE_VALUES.has(profile)) {
      errors.push(`${prefix}: invalid evidence profile ${String(profile)}`);
      continue;
    }
    const kinds = new Set(requirement.evidence.map(({ kind }) => kind));
    for (const requiredKind of PROFILE_KINDS[profile]) {
      if (!kinds.has(requiredKind)) {
        errors.push(`${prefix}: profile ${profile} requires ${requiredKind} evidence`);
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
      }
    } else if (evidence.kind !== 'documentation') {
      errors.push(`${prefix}: ${evidence.kind} evidence requires target or script`);
    }
  }
}

function validateFeatureInventory(
  workspaceRoot: string,
  requirements: Map<string, RequirementRecord>,
  evidenceFiles: Set<string>,
  errors: string[],
): void {
  const featureRoot = resolve(workspaceRoot, 'apps/e2e/acceptance/features');
  if (!existsSync(featureRoot)) return;
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
  if (value.version !== 1) errors.push(`${file}: version must be 1`);
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
  if (!isStringArray(value.projects) || value.projects.length === 0) {
    errors.push(`${file}: projects must list at least one Nx project`);
  }
  if (!Array.isArray(value.requirements) || value.requirements.length === 0) {
    errors.push(`${file}: requirements must list at least one mapping`);
  }

  return {
    version: 1,
    capability: typeof value.capability === 'string' ? value.capability : '',
    owners: {
      product: typeof owners.product === 'string' ? owners.product : '',
      verification: typeof owners.verification === 'string' ? owners.verification : '',
      ...(typeof owners.security === 'string' ? { security: owners.security } : {}),
      ...(typeof owners.operations === 'string' ? { operations: owners.operations } : {}),
    },
    projects: isStringArray(value.projects) ? value.projects : [],
    requirements: Array.isArray(value.requirements)
      ? value.requirements
          .filter(isRecord)
          .map((requirement) => ({
            id: typeof requirement.id === 'string' ? requirement.id : '',
            risk:
              typeof requirement.risk === 'string'
                ? (requirement.risk as RequirementRisk)
                : 'normal',
            profiles: isStringArray(requirement.profiles)
              ? (requirement.profiles as EvidenceProfile[])
              : [],
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
                }))
              : [],
          }))
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
): { targets: string[]; scripts: string[] } {
  const targets = new Set<string>();
  const scripts = new Set<string>();
  for (const id of requirementIds) {
    const requirement = model.requirements.get(id);
    if (!requirement) continue;
    for (const evidence of requirement.evidence) {
      if (lane !== undefined && !evidence.lanes.includes(lane)) continue;
      if (evidence.target) targets.add(evidence.target);
      if (evidence.script) scripts.add(evidence.script);
    }
  }
  return {
    targets: [...targets].sort(),
    scripts: [...scripts].sort(),
  };
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

function sourceSha(workspaceRoot: string): string {
  const result = run('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot });
  return result.status === 0 ? result.stdout.trim() : 'unknown';
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
