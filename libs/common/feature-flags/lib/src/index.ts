export type FeatureFlagValue = boolean | string | number;

export interface FeatureFlagContext {
  userId?: string;
  tenantId?: string;
  roles?: readonly string[];
  attributes?: Readonly<Record<string, string | number | boolean | undefined>>;
}

export interface FeatureFlagSnapshot {
  values: Readonly<Record<string, FeatureFlagValue>>;
  source: string;
}

export interface FeatureFlagProvider {
  readonly name: string;
  isEnabled(
    key: string,
    context?: FeatureFlagContext,
  ): Promise<boolean> | boolean;
  getValue<T extends FeatureFlagValue>(
    key: string,
    fallback: T,
    context?: FeatureFlagContext,
  ): Promise<T> | T;
  getSnapshot?(
    context?: FeatureFlagContext,
  ): Promise<FeatureFlagSnapshot> | FeatureFlagSnapshot;
}

export const FEATURE_FLAG_PROVIDER = Symbol("FEATURE_FLAG_PROVIDER");

export class StaticFeatureFlagProvider implements FeatureFlagProvider {
  readonly name: string = "static";

  constructor(
    private readonly flags: Readonly<Record<string, FeatureFlagValue>> = {},
  ) {}

  isEnabled(key: string): boolean {
    return toBoolean(this.flags[key]);
  }

  getValue<T extends FeatureFlagValue>(key: string, fallback: T): T {
    const value = this.flags[key];

    return Object.hasOwn(this.flags, key) ? (value as T) : fallback;
  }

  getSnapshot(): FeatureFlagSnapshot {
    return { source: this.name, values: { ...this.flags } };
  }
}

export class EnvironmentFeatureFlagProvider extends StaticFeatureFlagProvider {
  override readonly name = "environment";

  constructor(env: NodeJS.ProcessEnv = process.env, prefix = "FEATURE_") {
    super(readEnvironmentFlags(env, prefix));
  }
}

export function createFeatureFlagProvider(
  flags: Readonly<Record<string, FeatureFlagValue>> = {},
): FeatureFlagProvider {
  return new StaticFeatureFlagProvider(flags);
}

export function readEnvironmentFlags(
  env: NodeJS.ProcessEnv,
  prefix = "FEATURE_",
): Record<string, FeatureFlagValue> {
  const values: Record<string, FeatureFlagValue> = {};

  for (const [rawKey, rawValue] of Object.entries(env)) {
    if (rawValue === undefined || !rawKey.startsWith(prefix)) {
      continue;
    }

    const key = rawKey.slice(prefix.length).toLowerCase().replaceAll("_", ".");
    values[key] = parseFlagValue(rawValue);
  }

  return values;
}

// Feature flag values intentionally support booleans, numbers, and strings.
// eslint-disable-next-line sonarjs/function-return-type
export function parseFlagValue(value: string): FeatureFlagValue {
  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  const numericValue = Number(value);

  if (value.trim() !== "" && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return value;
}

function toBoolean(value: FeatureFlagValue | undefined): boolean {
  switch (typeof value) {
    case "boolean":
      return value;
    case "number":
      return value !== 0;
    case "string":
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    default:
      return false;
  }
}
