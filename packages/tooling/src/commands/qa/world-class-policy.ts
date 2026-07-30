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
