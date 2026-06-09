import type {
  FeatureFlagProvider,
  FeatureFlagSnapshot,
  FeatureFlagValue,
} from "./feature-flag.types";
import {
  readEnvironmentFlags,
  toFeatureFlagBoolean,
} from "./feature-flag-value";

export class InMemoryFeatureFlagProvider implements FeatureFlagProvider {
  readonly name: string = "in-memory";

  constructor(
    private readonly flags: Readonly<Record<string, FeatureFlagValue>> = {},
  ) {}

  isEnabled(key: string): boolean {
    return toFeatureFlagBoolean(this.flags[key]);
  }

  getValue<T extends FeatureFlagValue>(key: string, fallback: T): T {
    const value = this.flags[key];

    return Object.hasOwn(this.flags, key) ? (value as T) : fallback;
  }

  getSnapshot(): FeatureFlagSnapshot {
    return { source: this.name, values: { ...this.flags } };
  }
}

export class EnvironmentFeatureFlagProvider extends InMemoryFeatureFlagProvider {
  override readonly name = "environment";

  constructor(env: NodeJS.ProcessEnv = process.env, prefix = "FEATURE_") {
    super(readEnvironmentFlags(env, prefix));
  }
}

export function createFeatureFlagProvider(
  flags: Readonly<Record<string, FeatureFlagValue>> = {},
): FeatureFlagProvider {
  return new InMemoryFeatureFlagProvider(flags);
}
