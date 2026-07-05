import type {
  FeatureFlagProvider,
  FeatureFlagSnapshot,
  FeatureFlagValue,
} from "./feature-flag.types";
import {
  type FeatureFlagEnvironment,
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

    // Env-sourced flags are type-sniffed (FEATURE_X=5 becomes a number), so guard
    // against returning a value whose runtime type differs from the fallback's.
    if (Object.hasOwn(this.flags, key) && typeof value === typeof fallback) {
      return value as T;
    }

    return fallback;
  }

  getSnapshot(): FeatureFlagSnapshot {
    return { source: this.name, values: { ...this.flags } };
  }
}

export class EnvironmentFeatureFlagProvider extends InMemoryFeatureFlagProvider {
  override readonly name = "environment";

  constructor(
    env: FeatureFlagEnvironment = defaultFeatureFlagEnvironment(),
    prefix = "FEATURE_",
  ) {
    super(readEnvironmentFlags(env, prefix));
  }
}

export function createFeatureFlagProvider(
  flags: Readonly<Record<string, FeatureFlagValue>> = {},
): FeatureFlagProvider {
  return new InMemoryFeatureFlagProvider(flags);
}

function defaultFeatureFlagEnvironment(): FeatureFlagEnvironment {
  // `process` is not guaranteed on `globalThis` across runtimes (browser, edge
  // workers), so read it through a shape where it is genuinely optional rather
  // than trusting the Node ambient types that force it to be always present.
  const runtime = globalThis as {
    readonly process?: { readonly env?: FeatureFlagEnvironment };
  };

  return runtime.process?.env ?? {};
}
