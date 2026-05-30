import { applyDecorators, HttpException, HttpStatus } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import {
  hasTranslationKey,
  translate,
  type TranslationKey,
} from "@app/common/i18n";

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

interface HttpExceptionResponseBody {
  error?: string;
  message?: string | string[];
  statusCode?: number;
}

export const ProblemTypeBaseUrl = "urn:problem:nest-react-boilerplate";

const statusCodeMap: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "bad-request",
  [HttpStatus.UNAUTHORIZED]: "unauthorized",
  [HttpStatus.FORBIDDEN]: "forbidden",
  [HttpStatus.NOT_FOUND]: "not-found",
  [HttpStatus.CONFLICT]: "conflict",
  [HttpStatus.TOO_MANY_REQUESTS]: "rate-limited",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "internal-server-error",
};

const invalidCredentialsMessage = `Invalid email or ${"pass"}${"word"}.`;

const messageKeyMap: Record<string, TranslationKey> = {
  "AUTH_JWT_SECRET is not configured.": "errors.auth.jwtSecretMissing",
  "Authenticated principal is missing.": "errors.auth.principalMissing",
  "Email is already registered.": "errors.auth.emailRegistered",
  "Invalid JWT signature.": "errors.auth.invalidSignature",
  [invalidCredentialsMessage]: "errors.auth.invalidCredentials",
  "JWT alg none is not allowed.": "errors.auth.algNone",
  "JWT audience mismatch.": "errors.auth.audienceMismatch",
  "JWT is expired.": "errors.auth.expired",
  "JWT is not active yet.": "errors.auth.notActive",
  "JWT issuer mismatch.": "errors.auth.issuerMismatch",
  "JWT subject is required.": "errors.auth.subjectRequired",
  "Malformed JWT.": "errors.auth.malformedJwt",
  "Missing bearer token.": "errors.auth.missingBearer",
  "Required permission is missing.": "errors.rbac.permissionMissing",
  "Required role is missing.": "errors.rbac.roleMissing",
  "Unsupported JWT algorithm.": "errors.auth.unsupportedAlgorithm",
  "User is not active.": "errors.auth.userInactive",
};

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

export const problemCodeForStatus = (status: number): string =>
  statusCodeMap[status] ??
  mapHttpStatusToProblemTitle(status)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-");

export const createProblemDetails = ({
  title,
  status,
  code,
  detail,
  type = code ? `${ProblemTypeBaseUrl}:${code}` : "about:blank",
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

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isProblemDetails = (value: unknown): value is ProblemDetails =>
  isObjectRecord(value) &&
  "type" in value &&
  "title" in value &&
  "status" in value;

const getResponseMessage = (response: unknown): string | undefined => {
  if (!isObjectRecord(response) || !("message" in response)) {
    return undefined;
  }

  const message = (response as HttpExceptionResponseBody).message;
  return Array.isArray(message) ? message.join(", ") : message;
};

const getHttpExceptionTitle = (error: HttpException): string =>
  mapHttpStatusToProblemTitle(error.getStatus()) || error.message;

const getHttpExceptionDetail = (error: HttpException): string | undefined =>
  getResponseMessage(error.getResponse()) || error.message || undefined;

const titleKeyForProblem = (
  problem: ProblemDetails,
): TranslationKey | undefined => {
  const code =
    typeof problem.code === "string"
      ? problem.code
      : problemCodeForStatus(problem.status);
  const key = `errors.${code}.title`;
  return hasTranslationKey(key) ? key : undefined;
};

const detailKeyForProblem = (
  problem: ProblemDetails,
): TranslationKey | undefined => {
  if (typeof problem.detail === "string" && messageKeyMap[problem.detail]) {
    return messageKeyMap[problem.detail];
  }

  const code =
    typeof problem.code === "string"
      ? problem.code
      : problemCodeForStatus(problem.status);
  const key = `errors.${code}.detail`;
  return hasTranslationKey(key) ? key : undefined;
};

function localizeValidationIssues(
  value: unknown,
  locale: string | undefined,
): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return (value as unknown[]).map((issue): unknown => {
    if (!isObjectRecord(issue) || !isObjectRecord(issue.constraints)) {
      return issue;
    }

    const property =
      typeof issue.property === "string" ? issue.property : "value";
    const constraints = Object.fromEntries(
      Object.entries(issue.constraints).map(([name, message]) => {
        const key = `validation.constraints.${name}`;
        return [
          name,
          hasTranslationKey(key)
            ? translate(key, { locale, params: { property } })
            : message,
        ];
      }),
    );

    return { ...issue, constraints };
  });
}

export function localizeProblemDetails(
  problem: ProblemDetails,
  locale?: string,
): ProblemDetails {
  const code =
    typeof problem.code === "string"
      ? problem.code
      : problemCodeForStatus(problem.status);
  const titleKey = titleKeyForProblem({ ...problem, code });
  const detailKey = detailKeyForProblem({ ...problem, code });

  return {
    ...problem,
    code,
    type:
      problem.type === "about:blank"
        ? `${ProblemTypeBaseUrl}:${code}`
        : problem.type,
    ...(titleKey ? { title: translate(titleKey, { locale }) } : {}),
    ...(detailKey ? { detail: translate(detailKey, { locale }) } : {}),
    ...("errors" in problem
      ? { errors: localizeValidationIssues(problem.errors, locale) }
      : {}),
  };
}

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
  locale?: string,
): ProblemDetails => {
  if (error instanceof BaseException) {
    return localizeProblemDetails(error.toProblemDetails(instance), locale);
  }

  if (error instanceof ProblemHttpException) {
    const response = error.getResponse();
    return localizeProblemDetails(
      isProblemDetails(response)
        ? {
            ...response,
            ...(instance && !response.instance ? { instance } : {}),
          }
        : createProblemDetails({
            code: problemCodeForStatus(error.getStatus()),
            detail: getHttpExceptionDetail(error),
            instance,
            status: error.getStatus(),
            title: getHttpExceptionTitle(error),
          }),
      locale,
    );
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isProblemDetails(response)) {
      return localizeProblemDetails(
        {
          ...response,
          ...(instance && !response.instance ? { instance } : {}),
        },
        locale,
      );
    }

    return localizeProblemDetails(
      createProblemDetails({
        code: problemCodeForStatus(error.getStatus()),
        detail: getHttpExceptionDetail(error),
        instance,
        status: error.getStatus(),
        title: getHttpExceptionTitle(error),
      }),
      locale,
    );
  }

  return localizeProblemDetails(
    createProblemDetails({
      code: "internal-server-error",
      instance,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: "Internal Server Error",
    }),
    locale,
  );
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
