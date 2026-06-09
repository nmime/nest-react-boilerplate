import { ApiResponseKind } from "../../enum";

export function getHttpApiFailureResponseKind(
  status?: number,
): ApiResponseKind {
  if (!status) {
    return ApiResponseKind.NetworkError;
  }

  if (status === 400) return ApiResponseKind.BadRequest;
  if (status === 401) return ApiResponseKind.Unauthorized;
  if (status === 403) return ApiResponseKind.Forbidden;
  if (status === 404) return ApiResponseKind.NotFound;
  if (status === 409) return ApiResponseKind.Conflict;
  if (status === 429) return ApiResponseKind.TooManyRequests;
  if (status >= 500) return ApiResponseKind.ServerError;

  return ApiResponseKind.Unknown;
}
