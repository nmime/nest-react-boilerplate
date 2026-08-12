export const worldClassGateNames = [
  'real-user-journey-e2e',
  'load-stress-soak',
  'chaos-resilience',
  'disaster-recovery',
  'backup-restore-ci',
  'multi-tenant-security',
  'browser-device-cloud-matrix',
  'canary-synthetic-monitoring',
  'observability',
  'migration-rollback',
  'concurrency-race',
  'reliability-smoke',
] as const;

export type WorldClassGateName = (typeof worldClassGateNames)[number];

export interface GateSkip {
  name: string;
  reason?: unknown;
}

export function parseCommandArgv(raw: string, source: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${source} must be a JSON array of command arguments.`);
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(`${source} must be a non-empty JSON array of non-empty strings.`);
  }
  return value;
}

export function boundedInteger(options: {
  fallback: number;
  label: string;
  max: number;
  min?: number;
  value?: string | number;
}): number {
  const min = options.min ?? 1;
  if (options.value === undefined || options.value === '') return options.fallback;
  const raw = String(options.value);
  if (!/^\d+$/u.test(raw)) {
    throw new Error(`${options.label} must be an integer between ${min} and ${options.max}, received: ${raw}`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < min || value > options.max) {
    throw new Error(`${options.label} must be an integer between ${min} and ${options.max}, received: ${raw}`);
  }
  return value;
}

export function unknownWorldClassGates(selectedGates: ReadonlySet<string>): string[] {
  const knownGates = new Set<string>(worldClassGateNames);
  return [...selectedGates].filter((name) => !knownGates.has(name)).sort();
}

export interface CiOpsPipeline {
  /** Workspace-relative path, so a problem names the file a maintainer has to open. */
  file: string;
  text: string;
}

export interface CiOpsGateInput {
  packageJson: string;
  /** Every pipeline the CI gate descriptor declares, whichever forge owns it. */
  pipelines: readonly CiOpsPipeline[];
}

/**
 * What the backup/restore CI gate asserts about the pipelines themselves: the ops gates run,
 * and nothing runs them in dry-run. The caller supplies the pipeline text so the rule is a
 * property of the declared pipelines rather than of one forge's directory layout.
 *
 * Each pipeline is judged on its own text. Concatenating them first meant an unrelated
 * `--dry-run` — a Helm render in a deploy pipeline — indicted whichever file happened to
 * mention the gates.
 */
export function ciOpsGateProblems(input: CiOpsGateInput): string[] {
  const problems: string[] = [];

  if (/"quality:presets"\s*:\s*"[^"]*--dry-run/u.test(input.packageJson)) {
    problems.push('quality:presets must not default to dry-run');
  }

  for (const pipeline of input.pipelines) {
    if (!/world-class|backup-restore/u.test(pipeline.text)) continue;
    if (/--dry-run/u.test(pipeline.text)) problems.push(`CI ops gates must not use dry-run: ${pipeline.file}`);
  }

  if (!input.pipelines.some((pipeline) => /test:world-class|world-class-gates/u.test(pipeline.text))) {
    problems.push('CI must run world-class gates');
  }

  return problems;
}

export function disallowedRequiredSkips(options: {
  allowCiSkips: boolean;
  ciMode: boolean;
  selectedGates: ReadonlySet<string>;
  skipped: GateSkip[];
}): GateSkip[] {
  if (!options.ciMode || options.allowCiSkips) return [];

  const requiredForRun = options.selectedGates.size
    ? new Set(options.selectedGates)
    : new Set<string>(worldClassGateNames);
  return options.skipped.filter((entry) => requiredForRun.has(entry.name));
}
