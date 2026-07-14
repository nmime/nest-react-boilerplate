// Fail-closed normalization for RBAC principal claim lists (roles/permissions).
// Non-array input yields an empty list on purpose: malformed claims must never
// be silently coerced into grants. String parsing (comma/whitespace splitting)
// lives elsewhere for environment configuration and is intentionally excluded.
export const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0)),
  ];
};
