import { throwOnOpenApiErrorData, userApi } from "@app/frontend/api-client";
import type { UserProfilePayload } from "../model/profile";

export async function fetchUserProfile(
  userClient: Pick<typeof userApi, "profileControllerMe">,
  requestOptions: Parameters<typeof userApi.profileControllerMe>[0],
): Promise<UserProfilePayload> {
  return throwOnOpenApiErrorData(
    userClient.profileControllerMe(requestOptions),
  );
}

export const profileQueryKey = userApi.getProfileControllerMeQueryKey;
