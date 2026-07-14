import { HttpStatus } from '@nestjs/common';
import type { ExceptionDefinition } from '../type/exception-definition.type';
import type { ExceptionKind } from '../type/exception-kind.type';
import type { ProblemDetails } from '../type/problem-details.type';
import { ProblemTypeBaseUrl } from '../const/problem-type-base-url.const';
import { createProblemDetails } from '../util/create-problem-details.util';

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
export function getExceptionDefinition(constructor: ExceptionConstructor): ExceptionDefinition | undefined {
  return (constructor as unknown as Record<symbol, ExceptionDefinition>)[exceptionDefinitionKey];
}

/**
 * Runtime instance options — what varies per throw.
 */
export interface ExceptionInstanceOptions {
  /** Typed public data — mapped to `info` in response */
  data?: Record<string, unknown>;
  /** Private diagnostics — NEVER returned to client. Used for logging. */
  meta?: Record<string, unknown>;
  /** Original error — NEVER returned to client. */
  cause?: Error;
}

/**
 * Exception class factory — creates an exception class with static
 * RFC 9457 problem details.
 *
 * Static fields (type, title, detail, status) are set once at definition time.
 * Dynamic fields (data → info, instance) are set at throw time or HTTP boundary.
 */
export function Exception(def: ExceptionDefinition) {
  const { name, kind, problemType, title, detail, status, dataType } = def;
  const resolvedStatus = status ?? (kind === 'client' ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR);
  const typeUri = `${ProblemTypeBaseUrl}:${problemType}`;

  class ExceptionClass extends BaseException {
    /** Exception kind: client (4xx) or server (5xx) */
    readonly kind: ExceptionKind = kind;

    /** Static type URI — same for all instances */
    override readonly type: string = typeUri;

    /** Static title — same for all instances */
    override readonly title: string = title;

    /** Static detail — same for all instances, no runtime values */
    override readonly detail: string = detail;

    /** Static HTTP status */
    override readonly status: number = resolvedStatus;

    /** Static code (machine-readable problem type) */
    override readonly code: string = problemType;

    /** Runtime public context — mapped to `info` in response */
    override readonly data: Record<string, unknown> = {};

    /** Runtime private diagnostics — never exposed */
    override readonly meta: Record<string, unknown> = {};

    /** Original error — never exposed */
    override readonly cause?: Error;

    constructor(opts?: ExceptionInstanceOptions) {
      super(detail, opts?.cause);
      Object.defineProperty(this, 'name', { value: name, writable: false, enumerable: false, configurable: true });

      if (opts?.data) {
        this.data = { ...opts.data };
      }
      if (opts?.meta) {
        this.meta = { ...opts.meta };
      }
      if (opts?.cause) {
        this.cause = opts.cause;
      }
    }

    /**
     * Convert to ProblemDetails (RFC 9457).
     * Static fields from definition, instance from HTTP boundary.
     * meta and cause are NEVER serialized.
     */
    override toProblemDetails(instance?: string): ProblemDetails {
      const pd = createProblemDetails({
        type: this.type,
        title: this.title,
        status: this.status,
        detail: this.detail,
        code: this.code,
        instance,
      });

      // Map typed data to info
      if (Object.keys(this.data).length > 0) {
        (pd as Record<string, unknown>).info = { ...this.data };
      }

      return pd;
    }

    /** NestJS HttpException compatibility */
    getStatus(): number {
      return this.status;
    }

    /** NestJS HttpException compatibility — returns full problem details response body */
    getResponse(): ProblemDetails {
      return this.toProblemDetails();
    }
  }

  // Store definition on the class for runtime introspection
  (ExceptionClass as unknown as Record<symbol, ExceptionDefinition>)[exceptionDefinitionKey] = {
    name,
    kind,
    problemType,
    title,
    detail,
    status: resolvedStatus,
    dataType,
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
  /** Static detail */
  abstract readonly detail: string;
  /** Static HTTP status */
  abstract readonly status: number;
  /** Static code */
  abstract readonly code: string;

  /** Runtime public context */
  abstract readonly data: Record<string, unknown>;
  /** Runtime private diagnostics */
  abstract readonly meta: Record<string, unknown>;
  /** Original error */
  abstract override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.name = new.target.name;
  }

  toProblemDetails(_instance?: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.detail,
      code: this.code,
      instance: _instance,
    };
  }
}
