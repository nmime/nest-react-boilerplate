import type { ExceptionKind } from './exception-kind.type';
import type { ProblemTypeCode } from '@app/common-problem-details';

/**
 * Static exception definition. Custom problem types are resolved from the
 * cross-runtime registry so their URI, title, and status cannot drift.
 */
export interface ExceptionDefinition {
  /** Class name — must match the generated class */
  name: string;
  /** Client or server classification */
  kind: ExceptionKind;
  /** Registered custom problem type. Omit for the RFC-defined about:blank type. */
  problemType?: ProblemTypeCode;
  /** HTTP status for about:blank; registered problem types derive it from the registry. */
  status?: number;
  /** Typed public extension shape for documentation and constructor ownership. */
  extensionsType?: new () => unknown;
}

export interface ResolvedExceptionDefinition extends ExceptionDefinition {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly defaultDetail?: string;
}

/**
 * Runtime occurrence context — what varies per throw.
 */
export interface ExceptionContext<TExtensions = Record<string, unknown>> {
  /** Explicit public RFC 9457 extension members. */
  extensions?: TExtensions;
  /** Private diagnostics — NEVER returned to client. Used for logging. */
  meta?: Record<string, unknown>;
  /** Original error — NEVER returned to client. */
  cause?: Error;
}
