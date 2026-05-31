export const uniqueStrings = (values: readonly string[]): string[] => [
  ...new Set(values),
];

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.filter(isNonEmptyString).map((item) => item.trim()),
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/[\s,]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  }

  return [];
};

export const readRequiredEnv = (
  env: Record<string, string | undefined>,
  key: string,
): string => {
  const value = env[key];
  if (!isNonEmptyString(value)) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
};

export const maskSecret = (value: string | undefined): string => {
  if (!isNonEmptyString(value)) {
    return "not-configured";
  }

  const trimmed = value.trim();
  return trimmed.length <= 8
    ? "********"
    : `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
};
