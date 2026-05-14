import type { Result } from "neverthrow";

export interface OkResponse<T> {
  data: T;
}

export interface ProblemResponse {
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = OkResponse<T> | ProblemResponse;

export function createOkResponse<T>(data: T): OkResponse<T> {
  return { data };
}

export function createProblemResponse(
  code: string,
  message: string,
): ProblemResponse {
  return { error: { code, message } };
}

export function mapResultToResponse<
  T,
  E extends { code: string; message: string },
>(result: Result<T, E>): ApiResponse<T> {
  if (result.isOk()) {
    return createOkResponse(result.value);
  }

  return createProblemResponse(result.error.code, result.error.message);
}
