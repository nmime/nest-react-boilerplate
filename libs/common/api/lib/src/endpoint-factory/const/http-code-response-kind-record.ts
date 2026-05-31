import { ApiResponseKind } from "../../enum";

export const HttpCodeResponseKindRecord: Record<number, ApiResponseKind> = {
  200: ApiResponseKind.Ok,
  201: ApiResponseKind.Ok,
  204: ApiResponseKind.Ok,
  400: ApiResponseKind.BadRequest,
  401: ApiResponseKind.Unauthorized,
  403: ApiResponseKind.Forbidden,
  404: ApiResponseKind.NotFound,
  409: ApiResponseKind.Conflict,
  429: ApiResponseKind.TooManyRequests,
  500: ApiResponseKind.ServerError,
};
