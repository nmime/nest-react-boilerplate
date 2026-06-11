import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Result } from "neverthrow";
import {
  BaseException,
  createProblemDetails,
  localizeProblemDetails,
  toProblemDetails,
  type ProblemDetails,
} from "@app/common/exceptions";
import { resolveLocaleFromRequest } from "@app/common/i18n";

export interface OkResponse<T> {
  data: T;
}

export type ProblemResponse = ProblemDetails;

export type ApiResponse<T> = OkResponse<T> | ProblemResponse;

export function createOkResponse<T>(data: T): OkResponse<T> {
  return { data };
}

export function createProblemResponse(
  code: string,
  message: string,
  status = HttpStatus.BAD_REQUEST,
): ProblemResponse {
  return createProblemDetails({
    code,
    detail: message,
    status,
    title: message,
  });
}

interface ProblemHttpResponse {
  status: (code: number) => ProblemHttpResponse;
  type: (contentType: string) => ProblemHttpResponse;
  header?: (name: string, value: string) => ProblemHttpResponse;
  json?: (body: ProblemDetails) => unknown;
  send?: (body: ProblemDetails) => unknown;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isOkResponse = (value: unknown): value is OkResponse<unknown> =>
  isObjectRecord(value) && "data" in value;

export const isProblemResponse = (value: unknown): value is ProblemResponse =>
  isObjectRecord(value) &&
  typeof value.type === "string" &&
  typeof value.title === "string" &&
  typeof value.status === "number";

const isNeverthrowResult = <T, E>(value: unknown): value is Result<T, E> =>
  isObjectRecord(value) &&
  typeof value.isOk === "function" &&
  typeof value.isErr === "function";

export function mapResultToResponse<
  T,
  E extends
    | BaseException
    | HttpException
    | Error
    | { code: string; message: string },
>(result: Result<T, E>, locale?: string): ApiResponse<T> {
  if (result.isOk()) {
    return createOkResponse(result.value);
  }

  const error = result.error;
  if (error instanceof BaseException || error instanceof HttpException) {
    return toProblemDetails(error, undefined, locale);
  }

  if (error instanceof Error) {
    return localizeProblemDetails(
      createProblemDetails({
        code: "bad-request",
        detail: error.message,
        status: HttpStatus.BAD_REQUEST,
        title: "Bad Request",
      }),
      locale,
    );
  }

  return localizeProblemDetails(
    createProblemResponse(error.code, error.message),
    locale,
  );
}

export const mapValueToApiResponse = <T>(
  value: T,
): T | ApiResponse<unknown> => {
  let response: T | ApiResponse<unknown> = value;

  if (isNeverthrowResult<unknown, never>(value)) {
    response = mapResultToResponse(value);
  }

  return response;
};

@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const locale = resolveLocaleFromRequest(request);
    const problem = toProblemDetails(
      exception,
      request.originalUrl ?? request.url,
      locale,
    );

    const problemResponse = response
      .status(problem.status)
      .type("application/problem+json") as ProblemHttpResponse;
    problemResponse.header?.("content-language", locale);
    if (typeof problemResponse.json === "function") {
      problemResponse.json(problem);
    } else {
      problemResponse.send?.(problem);
    }
  }
}
