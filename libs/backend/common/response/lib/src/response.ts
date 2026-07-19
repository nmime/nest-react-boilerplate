import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from 'neverthrow';
import { BaseException, toProblemDetails, type ProblemDetailsResponse } from '@app/backend-common-exception';

export interface OkResponse<T> {
  data: T;
}

export type ProblemResponse = ProblemDetailsResponse;

export type ApiResponse<T> = OkResponse<T> | ProblemResponse;

export function createOkResponse<T>(data: T): OkResponse<T> {
  return { data };
}

export function createProblemResponse(status = HttpStatus.BAD_REQUEST): ProblemResponse {
  return toProblemDetails(new HttpException('', status));
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isOkResponse = (value: unknown): value is OkResponse<unknown> => isObjectRecord(value) && 'data' in value;

export const isProblemResponse = (value: unknown): value is ProblemResponse =>
  isObjectRecord(value) &&
  typeof value.type === 'string' &&
  typeof value.title === 'string' &&
  typeof value.status === 'number';

const isNeverthrowResult = <T, E>(value: unknown): value is Result<T, E> =>
  isObjectRecord(value) && typeof value.isOk === 'function' && typeof value.isErr === 'function';

export function mapResultToResponse<
  T,
  E extends BaseException | HttpException | Error | { code: string; message: string },
>(result: Result<T, E>, locale?: string): ApiResponse<T> {
  if (result.isOk()) {
    return createOkResponse(result.value);
  }

  const error = result.error;

  if (error instanceof BaseException) {
    return toProblemDetails(error, undefined, locale);
  }

  if (error instanceof HttpException) {
    // NEVER expose HttpException.message
    return toProblemDetails(error, undefined, locale);
  }

  // Error messages and structurally similar plain objects are untrusted.
  return toProblemDetails(error, undefined, locale);
}

export const mapValueToApiResponse = <T>(value: T): T | ApiResponse<unknown> => {
  let response: T | ApiResponse<unknown> = value;

  if (isNeverthrowResult<unknown, never>(value)) {
    response = mapResultToResponse(value);
  }

  return response;
};
