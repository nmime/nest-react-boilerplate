// Fail-closed normalization of raw role/permission claims into a de-duplicated
// string list. Kept as a dedicated util so the user-profile factory expresses
// only the profile-shaping concern. This is a deliberately local copy; unifying
// it with the shared @app/common-authz normalizer is out of scope here.
export function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim()));
  }

  if (typeof value === 'string') {
    return uniqueStrings(
      value
        .split(/[\s,]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  }

  return [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
