import { apiFetch } from "@app/api-client/support";
import { getUserApiBaseUrl } from "../../../shared/config";
import type { UserProfilePayload } from "../model/profile";

interface ApiEnvelope<TData> {
  data: TData;
}

const unwrapData = <TData>(payload: TData | ApiEnvelope<TData>): TData =>
  payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : payload;

export async function fetchUserProfile(
  authToken: string,
): Promise<UserProfilePayload> {
  const payload = await apiFetch<
    UserProfilePayload | ApiEnvelope<UserProfilePayload>
  >("/profile/me", { authToken, baseUrl: getUserApiBaseUrl() });

  return unwrapData(payload);
}

export const profileQueryKey = () => ["get", "/profile/me"] as const;
