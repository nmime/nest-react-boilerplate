/**
 * The forge-neutral CI gate inventory.
 *
 * Before this module the inventory of "what must pass before a change merges" existed
 * only as the text of .github/workflows/*.yml, and the validators that policed it read
 * that text. On any other forge those validators were dead code and the gates simply
 * did not exist. The inventory now lives in scripts/ci/gates.json; every forge renders
 * it, and this module is the single parser both the renderers and the checker share.
 */

export type JobStyle = 'github' | 'gitlab';

export interface CiForge {
  /** Pipeline file that runs the merge-blocking lanes. */
  pipeline: string;
  /** Job nesting used by this forge's YAML dialect. */
  jobStyle: JobStyle;
  /** Single fan-in job a branch protection rule can require. */
  aggregateJob: string;
  /** Pipeline file that builds, scans, signs, and publishes release images. */
  releasePipeline?: string;
  /** Pipeline file that promotes a released digest to an environment. */
  promotionPipeline?: string;
}

export type PipelineKind = 'default' | 'release' | 'promotion';

export interface CiGate {
  id: string;
  description: string;
  /** Any one of these commands appearing in the mapped job satisfies the gate. */
  commands: string[];
  /** Which of the forge's pipeline files the mapped job lives in. */
  pipeline: PipelineKind;
  lanes: string[];
  requiredForMerge: boolean;
  jobs: Record<string, string>;
  /** Present only when a gate deliberately does not run on every forge. */
  forges?: string[];
  /** Why the restriction above exists. Mandatory whenever `forges` is set. */
  reason?: string;
}

export interface CiLaneExecutor {
  file: string;
  job: string;
}

export interface CiLane {
  description: string;
  executors: Record<string, CiLaneExecutor>;
}

export interface SupplyChainControl {
  id: string;
  requirement: string;
  /** Pipeline of the forge that must carry this control. */
  scope: 'release' | 'promotion';
  /** Literal commands or settings that implement the control on every forge. */
  evidence: string[];
  /** Present only when a control deliberately holds on some forges and not others. */
  forges?: string[];
  /** Why the restriction above exists. Mandatory whenever `forges` is set. */
  reason?: string;
}

export interface CiContract {
  forges: Record<string, CiForge>;
  lanes: Record<string, CiLane>;
  gates: CiGate[];
  supplyChain: SupplyChainControl[];
}

export class CiContractError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid CI gate descriptor:\n  - ${problems.join('\n  - ')}`);
    this.name = 'CiContractError';
    this.problems = problems;
  }
}

const jobStyles = new Set<string>(['github', 'gitlab'] satisfies JobStyle[]);
const supplyChainScopes = new Set<string>(['release', 'promotion']);
const pipelineKinds = new Set<string>(['default', 'release', 'promotion'] satisfies PipelineKind[]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown, label: string, problems: string[]): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    problems.push(`${label} must be a non-empty array of strings`);
    return [];
  }

  if (value.length === 0) problems.push(`${label} must not be empty`);

  return value as string[];
}

function readStringMap(value: unknown, label: string, problems: string[]): Record<string, string> {
  if (!isRecord(value)) {
    problems.push(`${label} must be an object`);
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || entry.length === 0) {
      problems.push(`${label}.${key} must be a non-empty string`);
      continue;
    }
    result[key] = entry;
  }

  return result;
}

function parseForges(raw: unknown, problems: string[]): Record<string, CiForge> {
  if (!isRecord(raw)) {
    problems.push('forges must be an object keyed by forge id');
    return {};
  }

  const forges: Record<string, CiForge> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      problems.push(`forges.${id} must be an object`);
      continue;
    }
    const { pipeline, jobStyle, aggregateJob, releasePipeline, promotionPipeline } = value;
    if (typeof pipeline !== 'string' || pipeline.length === 0) {
      problems.push(`forges.${id}.pipeline must be a workspace-relative path`);
      continue;
    }
    if (typeof jobStyle !== 'string' || !jobStyles.has(jobStyle)) {
      problems.push(`forges.${id}.jobStyle must be one of: ${[...jobStyles].join(', ')}`);
      continue;
    }
    if (typeof aggregateJob !== 'string' || aggregateJob.length === 0) {
      problems.push(`forges.${id}.aggregateJob must name the fan-in job branch protection requires`);
      continue;
    }
    forges[id] = {
      pipeline,
      jobStyle: jobStyle as JobStyle,
      aggregateJob,
      ...(typeof releasePipeline === 'string' ? { releasePipeline } : {}),
      ...(typeof promotionPipeline === 'string' ? { promotionPipeline } : {}),
    };
  }

  return forges;
}

function parseLanes(raw: unknown, forgeIds: Set<string>, problems: string[]): Record<string, CiLane> {
  if (!isRecord(raw)) {
    problems.push('lanes must be an object keyed by lane id');
    return {};
  }

  const lanes: Record<string, CiLane> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value) || typeof value.description !== 'string' || value.description.length === 0) {
      problems.push(`lanes.${id} must be an object with a description`);
      continue;
    }
    if (!isRecord(value.executors)) {
      problems.push(`lanes.${id}.executors must map every forge to the job that runs the lane`);
      continue;
    }

    const executors: Record<string, CiLaneExecutor> = {};
    for (const [forgeId, executor] of Object.entries(value.executors)) {
      if (!forgeIds.has(forgeId)) {
        problems.push(`lanes.${id}.executors references unknown forge "${forgeId}"`);
        continue;
      }
      if (!isRecord(executor) || typeof executor.file !== 'string' || typeof executor.job !== 'string') {
        problems.push(`lanes.${id}.executors.${forgeId} must declare a file and a job`);
        continue;
      }
      executors[forgeId] = { file: executor.file, job: executor.job };
    }

    lanes[id] = { description: value.description, executors };
  }

  return lanes;
}

function parseGates(raw: unknown, forgeIds: Set<string>, laneIds: Set<string>, problems: string[]): CiGate[] {
  if (!Array.isArray(raw)) {
    problems.push('gates must be an array');
    return [];
  }

  const gates: CiGate[] = [];
  const seen = new Set<string>();
  for (const [index, value] of raw.entries()) {
    if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
      problems.push(`gates[${index}] must be an object with an id`);
      continue;
    }
    const { id } = value;
    if (seen.has(id)) {
      problems.push(`duplicate gate id "${id}"`);
      continue;
    }
    seen.add(id);

    if (typeof value.description !== 'string' || value.description.length === 0) {
      problems.push(`gates.${id}.description must explain what the gate proves`);
    }
    if (typeof value.requiredForMerge !== 'boolean') {
      problems.push(`gates.${id}.requiredForMerge must be a boolean`);
    }

    const pipeline = value.pipeline ?? 'default';
    if (typeof pipeline !== 'string' || !pipelineKinds.has(pipeline)) {
      problems.push(`gates.${id}.pipeline must be one of: ${[...pipelineKinds].join(', ')}`);
    } else if (pipeline !== 'default' && value.requiredForMerge === true) {
      problems.push(`gates.${id} runs in the ${pipeline} pipeline and cannot be required for merge`);
    }

    const commands = readStringArray(value.commands, `gates.${id}.commands`, problems);
    const lanes = readStringArray(value.lanes, `gates.${id}.lanes`, problems);
    for (const lane of lanes) {
      if (!laneIds.has(lane)) problems.push(`gates.${id} references unknown lane "${lane}"`);
    }

    const jobs = readStringMap(value.jobs, `gates.${id}.jobs`, problems);
    for (const forgeId of Object.keys(jobs)) {
      if (!forgeIds.has(forgeId)) problems.push(`gates.${id}.jobs references unknown forge "${forgeId}"`);
    }

    let forges: string[] | undefined;
    if (value.forges !== undefined) {
      forges = readStringArray(value.forges, `gates.${id}.forges`, problems);
      for (const forgeId of forges) {
        if (!forgeIds.has(forgeId)) problems.push(`gates.${id}.forges references unknown forge "${forgeId}"`);
      }
      if (typeof value.reason !== 'string' || value.reason.length === 0) {
        problems.push(`gates.${id} restricts itself to one forge and must record a reason`);
      }
    }

    gates.push({
      id,
      description: typeof value.description === 'string' ? value.description : '',
      commands,
      pipeline: pipelineKinds.has(String(pipeline)) ? (pipeline as PipelineKind) : 'default',
      lanes,
      requiredForMerge: value.requiredForMerge === true,
      jobs,
      ...(forges ? { forges } : {}),
      ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    });
  }

  return gates;
}

function parseSupplyChain(raw: unknown, forgeIds: Set<string>, problems: string[]): SupplyChainControl[] {
  if (!Array.isArray(raw)) {
    problems.push('supplyChain must be an array');
    return [];
  }

  const controls: SupplyChainControl[] = [];
  for (const [index, value] of raw.entries()) {
    if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
      problems.push(`supplyChain[${index}] must be an object with an id`);
      continue;
    }
    if (typeof value.requirement !== 'string' || value.requirement.length === 0) {
      problems.push(`supplyChain.${value.id}.requirement must state the control in prose`);
    }
    if (typeof value.scope !== 'string' || !supplyChainScopes.has(value.scope)) {
      problems.push(`supplyChain.${value.id}.scope must be one of: ${[...supplyChainScopes].join(', ')}`);
      continue;
    }

    let forges: string[] | undefined;
    if (value.forges !== undefined) {
      forges = readStringArray(value.forges, `supplyChain.${value.id}.forges`, problems);
      for (const forgeId of forges) {
        if (!forgeIds.has(forgeId)) problems.push(`supplyChain.${value.id}.forges references unknown forge "${forgeId}"`);
      }
      if (typeof value.reason !== 'string' || value.reason.length === 0) {
        problems.push(`supplyChain.${value.id} holds on only some forges and must record a reason`);
      }
    }

    controls.push({
      id: value.id,
      requirement: typeof value.requirement === 'string' ? value.requirement : '',
      scope: value.scope as SupplyChainControl['scope'],
      evidence: readStringArray(value.evidence, `supplyChain.${value.id}.evidence`, problems),
      ...(forges ? { forges } : {}),
      ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    });
  }

  return controls;
}

export function parseCiContract(raw: unknown): CiContract {
  const problems: string[] = [];

  if (!isRecord(raw)) throw new CiContractError(['descriptor must be a JSON object']);

  const forges = parseForges(raw.forges, problems);
  const forgeIds = new Set(Object.keys(forges));
  const lanes = parseLanes(raw.lanes, forgeIds, problems);
  const laneIds = new Set(Object.keys(lanes));
  const gates = parseGates(raw.gates, forgeIds, laneIds, problems);
  const supplyChain = parseSupplyChain(raw.supplyChain, forgeIds, problems);

  if (problems.length > 0) throw new CiContractError(problems);

  return { forges, lanes, gates, supplyChain };
}

/**
 * Slice one job out of a pipeline file. GitHub nests jobs two spaces under `jobs:`;
 * GitLab declares them at column zero. Anchoring on the indent instead of searching for
 * the bare name is what keeps `docker-fullstack` from matching `docker-fullstack-mongodb`.
 */
export function extractJob(pipelineText: string, jobId: string, style: JobStyle): string | undefined {
  const indent = style === 'github' ? '  ' : '';
  const lines = pipelineText.split('\n');
  const header = `${indent}${jobId}:`;
  const start = lines.findIndex((line) => line === header || line.startsWith(`${header} `));

  if (start === -1) return undefined;

  const boundary = new RegExp(`^${indent}\\S`, 'u');
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (boundary.test(lines[index] ?? '')) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

/** Whether a fan-in job lists `job` in its `needs:`, in either forge's list syntax. */
export function referencesJob(aggregateBlock: string, jobId: string): boolean {
  const escaped = jobId.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^\\s*-\\s*(?:job:\\s*)?${escaped}\\s*$`, 'mu').test(aggregateBlock);
}
