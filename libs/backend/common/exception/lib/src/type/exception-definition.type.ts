import type { ExceptionKind } from './exception-kind.type';

/**
 * Static exception definition — declares all problem details once.
 *
 * All string fields MUST be static literals. No template expressions,
 * no runtime values, no interpolation.
 */
export interface ExceptionDefinition {
  /** Class name — must match the generated class */
  name: string;
  /** Client or server classification */
  kind: ExceptionKind;
  /** Problem type identifier — used in type URI: /api/problems/{problemType} */
  problemType: string;
  /** RFC 9457 title — short, human-readable summary of the problem type */
  title: string;
  /** RFC 9457 detail — human-readable explanation, STATIC (no runtime values) */
  detail: string;
  /** Optional HTTP status code (defaults based on kind: 400 for client, 500 for server) */
  status?: number;
  /** Typed public context class — instances of this go into response `info` */
  dataType?: new () => unknown;
}

/**
 * Runtime occurrence context — what varies per throw.
 */
export interface ExceptionContext<TData = Record<string, unknown>> {
  /** Typed public data — mapped to `info` in response */
  data?: TData;
  /** Private diagnostics — NEVER returned to client. Used for logging. */
  meta?: Record<string, unknown>;
  /** Original error — NEVER returned to client. */
  cause?: Error;
}
