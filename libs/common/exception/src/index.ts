import { applyDecorators, HttpException, HttpStatus } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

export interface ProblemDetailsInput {
  title: string;
  status: number;
  code?: string;
  detail?: string;
  type?: string;
  instance?: string;
  extensions?: Record<string, unknown>;
}

export interface BaseExceptionInput extends ProblemDetailsInput {
  cause?: unknown;
}

export const ProblemTypeBaseUrl = "https://example.com/problems";

export const mapHttpStatusToProblemTitle = (status: number): string => {
  const title = (HttpStatus as unknown as Record<number, string>)[status];
  return typeof title === "string"
    ? title
        .toLowerCase()
        .split("_")
        .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Unexpected Error";
};

export const createProblemDetails = ({
  title,
  status,
  code,
  detail,
  type = code ? `${ProblemTypeBaseUrl}/${code}` : "about:blank",
  instance,
  extensions = {},
}: ProblemDetailsInput): ProblemDetails => ({
  type,
  title,
  status,
  ...(detail ? { detail } : {}),
  ...(instance ? { instance } : {}),
  ...(code ? { code } : {}),
  ...extensions,
});

export class BaseException extends Error {
  readonly code?: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly status: number;
  readonly title: string;
  readonly type?: string;
  readonly extensions?: Record<string, unknown>;

  constructor(input: BaseExceptionInput) {
    super(input.detail ?? input.title, { cause: input.cause });
    this.name = new.target.name;
    this.code = input.code;
    this.detail = input.detail;
    this.instance = input.instance;
    this.status = input.status;
    this.title = input.title;
    this.type = input.type;
    this.extensions = input.extensions;
  }

  toProblemDetails(instance?: string): ProblemDetails {
    return createProblemDetails({
      code: this.code,
      detail: this.detail,
      extensions: this.extensions,
      instance: this.instance ?? instance,
      status: this.status,
      title: this.title,
      type: this.type,
    });
  }
}

export class ProblemHttpException extends HttpException {
  constructor(input: ProblemDetailsInput) {
    super(createProblemDetails(input), input.status);
  }
}

export const Exception = {
  badRequest: (detail?: string, code = "bad-request") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.BAD_REQUEST,
      title: "Bad Request",
    }),
  conflict: (detail?: string, code = "conflict") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.CONFLICT,
      title: "Conflict",
    }),
  forbidden: (detail?: string, code = "forbidden") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.FORBIDDEN,
      title: "Forbidden",
    }),
  notFound: (detail?: string, code = "not-found") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.NOT_FOUND,
      title: "Not Found",
    }),
  unauthorized: (detail?: string, code = "unauthorized") =>
    new BaseException({
      code,
      detail,
      status: HttpStatus.UNAUTHORIZED,
      title: "Unauthorized",
    }),
};

const isProblemDetails = (value: unknown): value is ProblemDetails =>
  typeof value === "object" &&
  value !== null &&
  "type" in value &&
  "title" in value &&
  "status" in value;

const getHttpExceptionTitle = (error: HttpException): string => {
  const response = error.getResponse();

  if (typeof response === "object" && "message" in response) {
    const message = (response as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join(", ") : String(message);
  }

  return error.message || mapHttpStatusToProblemTitle(error.getStatus());
};

export const getProblemStatus = (error: unknown): number => {
  if (error instanceof BaseException) {
    return error.status;
  }

  if (error instanceof HttpException) {
    return error.getStatus();
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
};

export const toProblemDetails = (
  error: unknown,
  instance?: string,
): ProblemDetails => {
  if (error instanceof BaseException) {
    return error.toProblemDetails(instance);
  }

  if (error instanceof ProblemHttpException) {
    const response = error.getResponse();
    return isProblemDetails(response)
      ? { ...response, ...(instance && !response.instance ? { instance } : {}) }
      : createProblemDetails({
          instance,
          status: error.getStatus(),
          title: getHttpExceptionTitle(error),
        });
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isProblemDetails(response)) {
      return {
        ...response,
        ...(instance && !response.instance ? { instance } : {}),
      };
    }

    return createProblemDetails({
      instance,
      status: error.getStatus(),
      title: getHttpExceptionTitle(error),
    });
  }

  return createProblemDetails({
    instance,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    title: "Internal Server Error",
  });
};

export const problemDetailsOpenApiSchema = {
  type: "object",
  required: ["type", "title", "status"],
  properties: {
    type: { type: "string", example: "about:blank" },
    title: { type: "string", example: "Bad Request" },
    status: { type: "integer", example: 400 },
    detail: { type: "string" },
    instance: { type: "string" },
    code: { type: "string" },
  },
};

export function ApiProblemExceptions(
  ...statuses: number[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        description: mapHttpStatusToProblemTitle(status),
        schema: problemDetailsOpenApiSchema,
        status,
      }),
    ),
  );
}
