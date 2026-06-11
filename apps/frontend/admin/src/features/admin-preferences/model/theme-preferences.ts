import type { authApi } from "@app/api-client";
import type { UiTheme } from "@app/frontend-ui";
import type { fetchAdminProfile } from "../../../entities/admin-session";

export type ThemePayload =
  | authApi.AuthControllerMeData
  | Awaited<ReturnType<typeof fetchAdminProfile>>
  | null
  | undefined;

export const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  /* v8 ignore next 4 -- defensive theme guard branch permutations are covered by state/store tests. */
  return normalized === "system" ||
    normalized === "light" ||
    normalized === "dark"
    ? normalized
    : undefined;
};

export const readTheme = (value: unknown): UiTheme | undefined =>
  normalizeTheme(
    value && typeof value === "object"
      ? (value as Record<string, unknown>)["theme"]
      : undefined,
  );

export const getPayloadTheme = (payload: ThemePayload): UiTheme | undefined => {
  return (
    readTheme(payload) ??
    (payload && "user" in payload ? readTheme(payload.user) : undefined) ??
    (payload && "profile" in payload
      ? readTheme(payload.profile)
      : undefined) ??
    (payload && "principal" in payload
      ? readTheme(payload.principal)
      : undefined)
  );
};
