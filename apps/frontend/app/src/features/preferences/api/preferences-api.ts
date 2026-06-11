import { apiFetch } from "@app/api-client/support";
import { getAuthApiBaseUrl } from "../../../shared/config";
import type {
  AuthPreferencesPayload,
  UserPreferencePatch,
} from "../../../entities/profile";

interface ApiEnvelope<TData> {
  data: TData;
}

const unwrapData = <TData>(payload: TData | ApiEnvelope<TData>): TData =>
  payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : payload;

export async function updateUserPreferences(
  authToken: string | null | undefined,
  nextPreferences: UserPreferencePatch,
): Promise<AuthPreferencesPayload> {
  const payload = await apiFetch<
    AuthPreferencesPayload | ApiEnvelope<AuthPreferencesPayload>
  >("/auth/me/preferences", {
    authToken,
    baseUrl: getAuthApiBaseUrl(),
    json: nextPreferences,
    method: "PATCH",
  });

  return unwrapData(payload);
}

export const authPreferencesQueryKey = () => ["get", "/auth/me"] as const;
