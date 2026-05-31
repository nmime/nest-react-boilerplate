import { ApiResponseKind } from "../../enum";

export const ResponseKindHttpCodeRecord: Partial<
  Record<ApiResponseKind, number>
> = {
  [ApiResponseKind.Ok]: 200,
  [ApiResponseKind.BadRequest]: 400,
  [ApiResponseKind.Unauthorized]: 401,
  [ApiResponseKind.Forbidden]: 403,
  [ApiResponseKind.NotFound]: 404,
  [ApiResponseKind.Conflict]: 409,
  [ApiResponseKind.TooManyRequests]: 429,
  [ApiResponseKind.ServerError]: 500,
};
