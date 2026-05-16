import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type {
  CallHandler,
  ExceptionFilter,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { Result } from "neverthrow";
import { catchError, map, throwError } from "rxjs";
import type { Observable } from "rxjs";
import {
  BaseException,
  createProblemDetails,
  toProblemDetails,
  type ProblemDetails,
} from "@app/common/exception";

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
>(result: Result<T, E>): ApiResponse<T> {
  if (result.isOk()) {
    return createOkResponse(result.value);
  }

  const error = result.error;
  if (error instanceof BaseException || error instanceof HttpException) {
    return toProblemDetails(error);
  }

  if (error instanceof Error) {
    return createProblemDetails({
      detail: error.message,
      status: HttpStatus.BAD_REQUEST,
      title: error.message,
    });
  }

  return createProblemResponse(error.code, error.message);
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

@Injectable()
export class ProblemResponseTransformer implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => mapValueToApiResponse(value)),
      catchError((error: unknown) => throwError(() => error)),
    );
  }
}

@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = toProblemDetails(
      exception,
      request.originalUrl ?? request.url,
    );

    response
      .status(problem.status)
      .type("application/problem+json")
      .json(problem);
  }
}
