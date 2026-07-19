import { HttpStatus } from '@nestjs/common';
import { getProblemTypeDefinition, problemTypeForCode } from '@app/common-problem-details';
import type { ExceptionDefinition, ResolvedExceptionDefinition } from '../type/exception-definition.type';
import type { ExceptionKind } from '../type/exception-kind.type';
import type { ProblemDetailsResponse } from '../type/problem-details.type';
import { createProblemDetails } from '../util/create-problem-details.util';
import { mapHttpStatusToProblemTitle } from '../util/map-http-status-to-problem-title.util';

export * from '../type/exception-kind.type';

/**
 * Static metadata symbol — stores definition on the constructor.
 */
const exceptionDefinitionKey = Symbol('exceptionDefinition');

interface ExceptionConstructor {
  readonly prototype: unknown;
}

/**
 * Read the static ExceptionDefinition from a factory-created class.
 */
export function getExceptionDefinition(constructor: ExceptionConstructor): ResolvedExceptionDefinition | undefined {
  return (constructor as unknown as Record<symbol, ResolvedExceptionDefinition>)[exceptionDefinitionKey];
}

/**
 * Runtime instance options — what varies per throw.
 */
export interface ExceptionInstanceOptions {
  /** Explicit public RFC 9457 extension members. */
  extensions?: Record<string, unknown>;
  /** Private diagnostics — NEVER returned to client. Used for logging. */
  meta?: Record<string, unknown>;
  /** Original error — NEVER returned to client. */
  cause?: Error;
}

/**
 * Exception class factory — creates an exception class with static
 * RFC 9457 problem details.
 *
 * Type, title, and status come from the registered problem definition or the
 * RFC-defined about:blank semantics. Occurrence identifiers are added only at
 * the HTTP boundary; extensions are explicitly public.
 */
export function Exception(def: ExceptionDefinition) {
  const { name, kind, problemType, status, extensionsType } = def;
  const registeredProblem = problemType ? getProblemTypeDefinition(problemType) : undefined;
  if (problemType && !registeredProblem) {
    throw new TypeError(`Problem type ${JSON.stringify(problemType)} is not documented in the shared registry.`);
  }

  if (registeredProblem && status !== undefined && status !== registeredProblem.status) {
    throw new TypeError(`Problem type ${JSON.stringify(problemType)} must use status ${registeredProblem.status}.`);
  }

  const resolvedStatus =
    registeredProblem?.status ??
    status ??
    (kind === 'client' ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR);
  const minimumStatus = kind === 'client' ? 400 : 500;
  const maximumStatus = kind === 'client' ? 499 : 599;
  if (!Number.isInteger(resolvedStatus) || resolvedStatus < minimumStatus || resolvedStatus > maximumStatus) {
    throw new RangeError(`${kind} exception status must be between ${minimumStatus} and ${maximumStatus}.`);
  }

  const typeUri = registeredProblem ? problemTypeForCode(registeredProblem.code) : 'about:blank';
  const resolvedTitle = registeredProblem?.title ?? mapHttpStatusToProblemTitle(resolvedStatus);
  const defaultDetail = registeredProblem?.detail;
  const allowedExtensions = new Set(
    registeredProblem?.extensions.map(({ name: extensionName }) => extensionName).filter((name) => name !== 'code') ??
      [],
  );

  class ExceptionClass extends BaseException {
    /** Exception kind: client (4xx) or server (5xx) */
    readonly kind: ExceptionKind = kind;

    /** Static type URI — same for all instances */
    override readonly type: string = typeUri;

    /** Static title — same for all instances */
    override readonly title: string = resolvedTitle;

    /** Safe default occurrence detail from the documented problem type. */
    override readonly defaultDetail: string | undefined = defaultDetail;

    /** Static HTTP status */
    override readonly status: number = resolvedStatus;

    /** Static code (machine-readable problem type) */
    override readonly code: string | undefined = registeredProblem?.code;

    /** Explicit public problem-type extension members. */
    override readonly extensions: Record<string, unknown> = {};

    /** Runtime private diagnostics — never exposed */
    override readonly meta: Record<string, unknown> = {};

    /** Original error — never exposed */
    override readonly cause?: Error;

    constructor(opts?: ExceptionInstanceOptions) {
      super(defaultDetail ?? resolvedTitle, opts?.cause);
      Object.defineProperty(this, 'name', { value: name, writable: false, enumerable: false, configurable: true });

      if (opts?.extensions) {
        for (const extensionName of Object.keys(opts.extensions)) {
          if (!allowedExtensions.has(extensionName)) {
            throw new TypeError(
              `Problem type ${JSON.stringify(problemType ?? 'about:blank')} does not declare extension ${JSON.stringify(extensionName)}.`,
            );
          }
        }
        this.extensions = { ...opts.extensions };
      }
      if (opts?.meta) {
        this.meta = { ...opts.meta };
      }
      if (opts?.cause) {
        this.cause = opts.cause;
      }
    }

    /** NestJS HttpException compatibility */
    getStatus(): number {
      return this.status;
    }

    /** NestJS HttpException compatibility — returns full problem details response body */
    getResponse(): ProblemDetailsResponse {
      return this.toProblemDetails();
    }
  }

  // Store definition on the class for runtime introspection
  (ExceptionClass as unknown as Record<symbol, ResolvedExceptionDefinition>)[exceptionDefinitionKey] = {
    name,
    kind,
    problemType,
    type: typeUri,
    title: resolvedTitle,
    defaultDetail,
    status: resolvedStatus,
    extensionsType,
  };

  return ExceptionClass;
}

/**
 * Base class for all exceptions. Provides minimal Error semantics.
 */
export abstract class BaseException extends Error {
  /** Override name for TS compatibility */
  override name = '';

  /** Static type URI */
  abstract readonly type: string;
  /** Static title */
  abstract readonly title: string;
  /** Safe default occurrence detail, if the problem type defines one. */
  abstract readonly defaultDetail?: string;
  /** Static HTTP status */
  abstract readonly status: number;
  /** Static code */
  abstract readonly code?: string;

  /** Explicit public problem-type extension members. */
  abstract readonly extensions: Record<string, unknown>;
  /** Runtime private diagnostics */
  abstract readonly meta: Record<string, unknown>;
  /** Original error */
  abstract override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = new.target.name;
  }

  toProblemDetails(instance?: string): ProblemDetailsResponse {
    return createProblemDetails({
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.defaultDetail,
      instance,
      extensions: {
        ...this.extensions,
        ...(this.code ? { code: this.code } : {}),
      },
    });
  }
}
