import type { HealthIndicator, HealthIndicatorResult } from "../dto";

export interface EnvHealthIndicatorOptions {
  name?: string;
  required?: boolean;
  requiredVariables?: readonly string[];
  optionalVariables?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

export class EnvHealthIndicator implements HealthIndicator {
  readonly name: string;
  readonly required: boolean;
  private readonly requiredVariables: readonly string[];
  private readonly optionalVariables: readonly string[];
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: EnvHealthIndicatorOptions = {}) {
    this.name = options.name ?? "env";
    this.required = options.required ?? true;
    this.requiredVariables = options.requiredVariables ?? [];
    this.optionalVariables = options.optionalVariables ?? [];
    this.env = options.env ?? process.env;
  }

  check(): HealthIndicatorResult {
    if (
      this.requiredVariables.length === 0 &&
      this.optionalVariables.length === 0
    ) {
      return {
        name: this.name,
        status: "skipped",
        required: false,
        details: { reason: "no env variables configured" },
      };
    }

    const missingRequired = this.requiredVariables.filter(
      (key) => !hasEnvValue(this.env[key]),
    );
    const missingOptional = this.optionalVariables.filter(
      (key) => !hasEnvValue(this.env[key]),
    );

    const status = resolveEnvStatus(
      missingRequired.length,
      missingOptional.length,
    );

    return {
      name: this.name,
      status,
      required: this.required,
      details: {
        requiredConfigured:
          this.requiredVariables.length - missingRequired.length,
        requiredTotal: this.requiredVariables.length,
        optionalConfigured:
          this.optionalVariables.length - missingOptional.length,
        optionalTotal: this.optionalVariables.length,
        missingRequired,
        missingOptional,
      },
    };
  }
}

function hasEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveEnvStatus(
  missingRequiredCount: number,
  missingOptionalCount: number,
): HealthIndicatorResult["status"] {
  if (missingRequiredCount > 0) {
    return "error";
  }

  if (missingOptionalCount > 0) {
    return "degraded";
  }

  return "ok";
}
