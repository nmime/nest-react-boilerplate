// Internal shared type guard. Intentionally NOT re-exported from util/index.ts:
// it is a lib-private helper and must stay out of the public @app/backend-common-exception API.
export const isObjectRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
