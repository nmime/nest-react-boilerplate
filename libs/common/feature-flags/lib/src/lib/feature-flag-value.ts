import type { FeatureFlagValue } from "./feature-flag.types";

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

export function toFeatureFlagBoolean(
  value: FeatureFlagValue | undefined,
): boolean {
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
