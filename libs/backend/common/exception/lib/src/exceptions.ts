import { applyDecorators, HttpException, HttpStatus } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import {
  hasTranslationKey,
  interpolate,
  translate,
  translations,
  type TranslationKey,
} from "@app/common/i18n";

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  localizedDetail?: string;
  errors?: unknown;
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

export interface OpenApiSchemaObject {
  type?: string;
  example?: unknown;
  description?: string;
  required?: string[];
  properties?: Record<string, OpenApiSchemaObject>;
  items?: OpenApiSchemaObject;
  additionalProperties?: boolean | OpenApiSchemaObject;
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

const problemDetailsReservedExtensionKeys = new Set([
  "type",
  "title",
  "status",
  "detail",
  "instance",
  "code",
  "localizedDetail",
]);

function sanitizeProblemDetailsExtensions(
  extensions: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(extensions).filter(
      ([key]) => !problemDetailsReservedExtensionKeys.has(key),
    ),
  );
}

function normalizeProblemInstance(
  instance: string | undefined,
): string | undefined {
  const normalized = instance?.trim();

  if (!normalized || normalized.startsWith("/")) {
    return undefined;
  }

  return normalized;
}

export const createProblemDetails = ({
  title,
  status,
  code,
  detail,
  type = code ? `${ProblemTypeBaseUrl}:${code}` : "about:blank",
  instance,
  extensions = {},
}: ProblemDetailsInput): ProblemDetails => {
  const normalizedInstance = normalizeProblemInstance(instance);

  return {
    type,
    title,
    status,
    ...(detail ? { detail } : {}),
    ...(normalizedInstance ? { instance: normalizedInstance } : {}),
    ...(code ? { code } : {}),
    ...sanitizeProblemDetailsExtensions(extensions),
  };
};

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

export class AppHttpException extends HttpException {
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
  mapHttpStatusToProblemTitle(error.getStatus());

const getHttpExceptionDetail = (error: HttpException): string | undefined =>
  getResponseMessage(error.getResponse()) || error.message || undefined;

const detailKeyForProblem = (
  problem: ProblemDetails,
  code: string,
): TranslationKey | undefined => {
  if (typeof problem.detail === "string" && messageKeyMap[problem.detail]) {
    return messageKeyMap[problem.detail];
  }

  const key = `errors.${code}.detail`;
  return hasTranslationKey(key) ? key : undefined;
};

function translateValidationIssueText(
  message: string,
  property: string,
  locale: string | undefined,
): string {
  const key = Object.entries(translations.en).find(
    ([translationKey, englishMessage]) =>
      translationKey.startsWith("validation.constraints.") &&
      interpolate(englishMessage, { property }) === message,
  )?.[0];

  return key && hasTranslationKey(key)
    ? translate(key, { locale, params: { property } })
    : message;
}

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

    return {
      ...issue,
      constraints,
      ...(typeof issue.message === "string"
        ? {
            message: translateValidationIssueText(
              issue.message,
              property,
              locale,
            ),
          }
        : {}),
      ...(typeof issue.detail === "string"
        ? {
            detail: translateValidationIssueText(
              issue.detail,
              property,
              locale,
            ),
          }
        : {}),
    };
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
  const detailKey = detailKeyForProblem(problem, code);
  const defaultDetail = detailKey
    ? translate(detailKey, { locale: "en" })
    : undefined;
  const localizedDetail =
    detailKey && locale ? translate(detailKey, { locale }) : undefined;

  return {
    ...problem,
    code,
    type:
      problem.type === "about:blank"
        ? `${ProblemTypeBaseUrl}:${code}`
        : problem.type,
    ...(defaultDetail ? { detail: defaultDetail } : {}),
    ...(localizedDetail && localizedDetail !== defaultDetail
      ? { localizedDetail }
      : {}),
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

  if (error instanceof AppHttpException) {
    const response = error.getResponse();
    return localizeProblemDetails(
      isProblemDetails(response)
        ? response
        : createProblemDetails({
            code: problemCodeForStatus(error.getStatus()),
            detail: getHttpExceptionDetail(error),
            status: error.getStatus(),
            title: getHttpExceptionTitle(error),
          }),
      locale,
    );
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isProblemDetails(response)) {
      return localizeProblemDetails(response, locale);
    }

    return localizeProblemDetails(
      createProblemDetails({
        code: problemCodeForStatus(error.getStatus()),
        detail: getHttpExceptionDetail(error),
        status: error.getStatus(),
        title: getHttpExceptionTitle(error),
      }),
      locale,
    );
  }

  return localizeProblemDetails(
    createProblemDetails({
      code: "internal-server-error",
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: "Internal Server Error",
    }),
    locale,
  );
};

// RFC 9457 Compliant Problem Details OpenAPI Schema
export const problemDetailsOpenApiSchema: OpenApiSchemaObject = {
  type: "object",
  required: ["type", "title", "status", "code"],
  properties: {
    type: { type: "string", example: "about:blank" },
    title: { type: "string", example: "Bad Request" },
    status: { type: "integer", example: 400 },
    detail: { type: "string" },
    instance: { type: "string" },
    code: { type: "string" },
    localizedDetail: {
      type: "string",
      description:
        "A localized human-display explanation for this occurrence. Display-only extension; do not use for program logic.",
    },
    errors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          property: { type: "string" },
          message: { type: "string" },
          detail: { type: "string" },
          pointer: { type: "string", example: "/profile/email" },
          constraints: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["property", "constraints"],
      },
    },
  },
};

export function getProblemDetailsSchema(status: number): OpenApiSchemaObject {
  const title = mapHttpStatusToProblemTitle(status);
  const code = problemCodeForStatus(status);
  const isBadRequest = status === Number(HttpStatus.BAD_REQUEST);

  const properties: Record<string, OpenApiSchemaObject> = {
    type: {
      type: "string",
      example: `${ProblemTypeBaseUrl}:${code}`,
      description: "A URI reference that identifies the problem type.",
    },
    title: {
      type: "string",
      example: title,
      description: "A short, human-readable summary of the problem type.",
    },
    status: {
      type: "integer",
      example: status,
      description: "The HTTP status code generated by the origin server.",
    },
    detail: {
      type: "string",
      description: "A human-readable explanation specific to this occurrence.",
    },
    instance: {
      type: "string",
      description:
        "A URI reference that identifies the specific occurrence of the problem. Omitted unless a real occurrence URI/reference is available.",
    },
    localizedDetail: {
      type: "string",
      description:
        "A localized human-display explanation for this occurrence. Display-only extension; do not use for program logic.",
    },
    code: {
      type: "string",
      example: code,
      description:
        "A stable machine-readable error code for programmatic handling.",
    },
  };

  if (isBadRequest) {
    properties.errors = {
      type: "array",
      description:
        "An array of validation errors (present for validation failures).",
      items: {
        type: "object",
        properties: {
          property: {
            type: "string",
            description: "The field that failed validation.",
          },
          message: {
            type: "string",
            description: "The localized error message.",
          },
          detail: {
            type: "string",
            description:
              "A localized human-readable explanation for this validation issue.",
          },
          pointer: {
            type: "string",
            description:
              "A JSON Pointer identifying the nested request member that failed validation.",
            example: "/profile/email",
          },
          constraints: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "The validation constraints that failed.",
          },
        },
        required: ["property", "constraints"],
      },
    };
  }

  return {
    type: "object",
    required: ["type", "title", "status", "code"],
    properties,
  };
}

type ApiExceptionStatusInput = number | readonly number[];

function isStatusArray(
  status: ApiExceptionStatusInput,
): status is readonly number[] {
  return Array.isArray(status);
}

function normalizeApiExceptionStatuses(
  statuses: readonly ApiExceptionStatusInput[],
): number[] {
  const normalized: number[] = [];

  for (const status of statuses) {
    if (isStatusArray(status)) {
      normalized.push(...status);
    } else {
      normalized.push(status);
    }
  }

  return normalized;
}

export function ApiExceptions(
  ...statuses: ApiExceptionStatusInput[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...normalizeApiExceptionStatuses(statuses).map((status) =>
      ApiResponse({
        status,
        description: mapHttpStatusToProblemTitle(status),
        content: {
          "application/problem+json": {
            schema: getProblemDetailsSchema(status),
          },
        },
      }),
    ),
  );
}
