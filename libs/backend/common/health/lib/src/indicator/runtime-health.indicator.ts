import type { HealthIndicator, HealthIndicatorContext, HealthIndicatorResult } from '../dto';

interface RuntimeVersions {
  bun?: string;
  node?: string;
}

export function detectRuntimeDetails(versions: RuntimeVersions = process.versions): {
  runtime: 'bun' | 'node';
  version: string;
} {
  const bunVersion = versions.bun?.trim();
  return bunVersion
    ? { runtime: 'bun', version: bunVersion }
    : { runtime: 'node', version: versions.node ?? process.version.replace(/^v/u, '') };
}

export class RuntimeHealthIndicator implements HealthIndicator {
  readonly name = 'runtime';
  readonly required = true;
  readonly livenessSafe = true;

  constructor(private readonly versions: RuntimeVersions = process.versions) {}

  check(context?: HealthIndicatorContext): HealthIndicatorResult {
    return {
      name: this.name,
      status: 'ok',
      required: this.required,
      details: {
        app: context?.appName,
        ...detectRuntimeDetails(this.versions),
      },
    };
  }
}
