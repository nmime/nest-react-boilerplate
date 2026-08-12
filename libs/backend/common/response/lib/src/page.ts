import { Exception, ExceptionKind } from '@app/backend-common-exception';
import type { OkResponse } from './response';

/** Page size used when a request carries no explicit limit. */
export const DefaultPageSize = 20;
/** Hard ceiling on the page size, so a caller cannot turn a list route into a full-table read. */
export const MaximumPageSize = 100;
/** Ceiling on an inbound cursor, so an attacker cannot force large base64 decodes. */
export const MaximumCursorLength = 512;

export interface PageLimits {
  readonly defaultPageSize?: number;
  readonly maxPageSize?: number;
  readonly maxCursorLength?: number;
}

export interface OffsetPageQuery {
  readonly limit?: number;
  readonly offset?: number;
}

export interface NormalizedOffsetPage {
  readonly limit: number;
  readonly offset: number;
}

export interface PageInfo {
  readonly limit: number;
  readonly offset?: number;
  readonly total?: number;
  /** Opaque continuation token; absent on the last page. */
  readonly nextCursor?: string;
}

/** The one list envelope every paged route returns, so generated clients see a single shape. */
export interface PageResponse<T> extends OkResponse<T[]> {
  readonly page: PageInfo;
}

const PageCursorExtensionsType = class {
  errors!: { detail: string; pointer: string }[];
};

/**
 * Raised when an inbound cursor is absent from our own encoding. Cursors are
 * opaque to clients, so the only legitimate value is one this service issued;
 * anything else is a tampering attempt or a stale bookmark, and both deserve the
 * same undifferentiated validation problem.
 */
export class PageCursorException extends Exception({
  name: 'PageCursorException',
  kind: ExceptionKind.Client,
  problemType: 'client-data-validation',
  extensionsType: PageCursorExtensionsType,
}) {
  constructor() {
    super({ extensions: { errors: [{ detail: 'cursor is not a valid page cursor.', pointer: '#/cursor' }] } });
  }
}

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

/**
 * Turns an untrusted limit/offset query into a bounded page.
 *
 * Values are clamped rather than rejected: DTO validation is the place that
 * tells a caller their input was wrong, and this is the last line of defence
 * that keeps an unvalidated or internally-constructed query from reaching the
 * database unbounded.
 */
export function normalizeOffsetPage(query: OffsetPageQuery, limits: PageLimits = {}): NormalizedOffsetPage {
  const maxPageSize = limits.maxPageSize ?? MaximumPageSize;

  return {
    limit: clampInteger(query.limit, limits.defaultPageSize ?? DefaultPageSize, 1, maxPageSize),
    offset: clampInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function encodePageCursor(payload: Readonly<Record<string, unknown>>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodePageCursor(cursor: string, limits: PageLimits = {}): Record<string, unknown> {
  if (cursor.length === 0 || cursor.length > (limits.maxCursorLength ?? MaximumCursorLength)) {
    throw new PageCursorException();
  }

  // Node's base64url decoder is lenient: it silently drops characters outside
  // the alphabet instead of failing, so two different cursors can decode to the
  // same bytes. Re-encoding and comparing is what makes a tampered cursor
  // detectable rather than merely harmless.
  const decoded = Buffer.from(cursor, 'base64url');
  if (decoded.toString('base64url') !== cursor) {
    throw new PageCursorException();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.toString('utf8'));
  } catch {
    throw new PageCursorException();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PageCursorException();
  }

  return parsed as Record<string, unknown>;
}

export function createPageResponse<T>(items: readonly T[], page: PageInfo): PageResponse<T> {
  return { data: [...items], page };
}

export function isPageResponse(value: unknown): value is PageResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { data?: unknown }).data) &&
    typeof (value as { page?: unknown }).page === 'object' &&
    (value as { page?: unknown }).page !== null
  );
}
