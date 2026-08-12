// @requirements REQ-API-RESPONSE-006
import { describe, expect, it } from 'vitest';
import {
  DefaultPageSize,
  MaximumCursorLength,
  MaximumPageSize,
  PageCursorException,
  createPageResponse,
  decodePageCursor,
  encodePageCursor,
  isPageResponse,
  normalizeOffsetPage,
} from './page';

describe('normalizeOffsetPage', () => {
  it('falls back to the shared defaults when the query carries no paging members', () => {
    expect(normalizeOffsetPage({})).toEqual({ limit: DefaultPageSize, offset: 0 });
  });

  it('clamps the page size to the configured maximum', () => {
    expect(normalizeOffsetPage({ limit: 5000 })).toEqual({ limit: MaximumPageSize, offset: 0 });
  });

  it('honours a per-endpoint maximum page size', () => {
    expect(normalizeOffsetPage({ limit: 40 }, { maxPageSize: 25 })).toEqual({ limit: 25, offset: 0 });
  });

  it('honours a per-endpoint default page size', () => {
    expect(normalizeOffsetPage({}, { defaultPageSize: 7 })).toEqual({ limit: 7, offset: 0 });
  });

  it('refuses a non-positive page size instead of querying with it', () => {
    expect(normalizeOffsetPage({ limit: 0, offset: -10 })).toEqual({ limit: 1, offset: 0 });
  });

  it('truncates fractional paging members', () => {
    expect(normalizeOffsetPage({ limit: 10.9, offset: 3.7 })).toEqual({ limit: 10, offset: 3 });
  });

  it('ignores non-finite paging members', () => {
    expect(normalizeOffsetPage({ limit: Number.NaN, offset: Number.POSITIVE_INFINITY })).toEqual({
      limit: DefaultPageSize,
      offset: 0,
    });
  });
});

describe('page cursors', () => {
  it('round-trips an opaque cursor payload', () => {
    const cursor = encodePageCursor({ id: 'abc', createdAt: '2026-01-01T00:00:00.000Z' });

    expect(cursor).not.toContain('{');
    expect(decodePageCursor(cursor)).toEqual({ id: 'abc', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  it('rejects a cursor whose encoding is not the canonical one', () => {
    const cursor = `${encodePageCursor({ id: 'abc' })}=`;

    expect(() => decodePageCursor(cursor)).toThrow(PageCursorException);
  });

  it('rejects an empty cursor', () => {
    expect(() => decodePageCursor('')).toThrow(PageCursorException);
  });

  it('rejects a cursor longer than the configured maximum', () => {
    const cursor = encodePageCursor({ id: 'a'.repeat(MaximumCursorLength) });

    expect(cursor.length).toBeGreaterThan(MaximumCursorLength);
    expect(() => decodePageCursor(cursor)).toThrow(PageCursorException);
    expect(() => decodePageCursor(cursor, { maxCursorLength: cursor.length })).not.toThrow();
  });

  it('rejects a cursor that does not decode to JSON', () => {
    const cursor = Buffer.from('not json', 'utf8').toString('base64url');

    expect(() => decodePageCursor(cursor)).toThrow(PageCursorException);
  });

  it('rejects a cursor that decodes to a non-object', () => {
    const cursor = Buffer.from(JSON.stringify(['a']), 'utf8').toString('base64url');

    expect(() => decodePageCursor(cursor)).toThrow(PageCursorException);
  });

  it('rejects a cursor that decodes to a JSON scalar', () => {
    const cursor = Buffer.from(JSON.stringify(7), 'utf8').toString('base64url');

    expect(() => decodePageCursor(cursor)).toThrow(PageCursorException);
  });

  it('reports the cursor member as an RFC 9457 validation problem', () => {
    const problem = new PageCursorException().toProblemDetails();

    expect(problem.status).toBe(400);
    expect(problem.code).toBe('client-data-validation');
    expect(problem.errors).toEqual([{ detail: 'cursor is not a valid page cursor.', pointer: '#/cursor' }]);
  });
});

describe('createPageResponse', () => {
  it('wraps items in the shared page envelope', () => {
    const response = createPageResponse([{ id: 1 }], { limit: 20, offset: 0, total: 1 });

    expect(response).toEqual({ data: [{ id: 1 }], page: { limit: 20, offset: 0, total: 1 } });
    expect(isPageResponse(response)).toBe(true);
  });

  it('carries the next cursor when the caller supplies one', () => {
    const response = createPageResponse([], { limit: 20, nextCursor: encodePageCursor({ id: 'x' }) });

    expect(response.page.nextCursor).toBe(encodePageCursor({ id: 'x' }));
  });

  it('rejects values that are not page envelopes', () => {
    expect(isPageResponse({ data: [] })).toBe(false);
    expect(isPageResponse(null)).toBe(false);
  });
});
