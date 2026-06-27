import { authApi, throwOnOpenApiErrorData } from "@app/frontend/api-client";
import type {
  AuthPreferencesPayload,
  UserPreferencePatch,
} from "../../../entities/profile";

export async function updateUserPreferences(
  authClient: Pick<typeof authApi, "authControllerUpdatePreferences">,
  requestOptions: Parameters<typeof authApi.authControllerUpdatePreferences>[1],
  nextPreferences: UserPreferencePatch,
): Promise<AuthPreferencesPayload> {
  return throwOnOpenApiErrorData(
    authClient.authControllerUpdatePreferences(nextPreferences, requestOptions),
  );
}

export const authPreferencesQueryKey = authApi.getAuthControllerMeQueryKey;
