import type {
  HealthIndicator,
  HealthIndicatorContext,
  HealthIndicatorResult,
} from "../dto";

export class RuntimeHealthIndicator implements HealthIndicator {
  readonly name = "runtime";
  readonly required = true;

  check(context?: HealthIndicatorContext): HealthIndicatorResult {
    return {
      name: this.name,
      status: "ok",
      required: this.required,
      details: {
        app: context?.appName,
        runtime: "node",
      },
    };
  }
}
