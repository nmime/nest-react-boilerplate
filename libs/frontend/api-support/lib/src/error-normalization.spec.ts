import { describe, expect, it } from 'vitest';

import {
  FrontendErrorKey,
  enrichJsonResponse,
  extractValidation,
  isNetworkFailure,
  normalizeApiError,
  readJsonBody,
} from './error-normalization';

const jsonResponse = (body: unknown, init: ResponseInit & { contentType?: string } = {}): Response => {
  const { contentType = 'application/json', ...responseInit } = init;
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    ...responseInit,
    headers: { 'content-type': contentType, ...responseInit.headers },
  });
};

describe('normalizeApiError', () => {
  it('classifies network failures when no response is present', () => {
    const error = normalizeApiError({
      endpoint: '/profile',
      error: new TypeError('Failed to fetch'),
      method: 'get',
    });

    expect(error).toMatchObject({
      code: 'network.offline',
      kind: 'network',
      message: 'Failed to fetch',
      method: 'GET',
      status: null,
    });
    expect(error.id).toBe('GET:/profile:network:network.offline');
  });

  it('classifies 401 and 403 responses as auth errors', () => {
    expect(normalizeApiError({ response: { status: 401, statusText: '' } }).kind).toBe('auth');
    expect(normalizeApiError({ response: { status: 403, statusText: '' } }).kind).toBe('auth');
  });

  it('classifies 400/422 with validation issues as validation errors', () => {
    const error = normalizeApiError({
      body: { errors: [{ field: 'email', message: 'Required' }] },
      response: { status: 422, statusText: 'Unprocessable' },
    });

    expect(error.kind).toBe('validation');
    expect(error.validation).toEqual([{ field: 'email', message: 'Required' }]);
  });

  it('treats 400 without validation issues as a plain client error', () => {
    expect(
      normalizeApiError({
        body: { message: 'Bad input' },
        response: { status: 400, statusText: 'Bad Request' },
      }).kind,
    ).toBe('client');
  });

  it('classifies 5xx as server and other 4xx as client errors', () => {
    expect(normalizeApiError({ response: { status: 503, statusText: '' } }).kind).toBe('server');
    expect(normalizeApiError({ response: { status: 404, statusText: '' } }).kind).toBe('client');
  });

  it('falls back to the unknown kind for non-error status codes', () => {
    expect(normalizeApiError({ response: { status: 302, statusText: '' } }).kind).toBe('unknown');
  });

  it('uses a custom RFC problem type as the primary machine identifier', () => {
    expect(
      normalizeApiError({
        body: {
          type: 'https://example.com/problems#resource-conflict',
          code: 'resource-conflict',
        },
        response: { status: 409, statusText: '' },
      }),
    ).toMatchObject({
      code: 'https://example.com/problems#resource-conflict',
      type: 'https://example.com/problems#resource-conflict',
    });

    expect(
      normalizeApiError({
        body: { code: 'billing.declined' },
        response: { status: 402, statusText: '' },
      }).code,
    ).toBe('billing.declined');

    expect(
      normalizeApiError({
        body: { errorCode: 'rate.limited' },
        response: { status: 429, statusText: '' },
      }).code,
    ).toBe('rate.limited');

    expect(normalizeApiError({ response: { status: 404, statusText: '' } }).code).toBe('http.404');
  });

  it('derives a human message from body fields, error, or status text', () => {
    expect(
      normalizeApiError({
        body: { detail: 'Локализовано' },
        response: { status: 400, statusText: 'Bad' },
      }).message,
    ).toBe('Локализовано');

    expect(
      normalizeApiError({
        error: new Error('boom'),
        response: { status: 500, statusText: '' },
      }).message,
    ).toBe('boom');

    expect(
      normalizeApiError({
        response: { status: 500, statusText: 'Server Error' },
      }).message,
    ).toBe('Server Error');

    expect(normalizeApiError({ response: { status: 500, statusText: '' } }).message).toBe(
      'Request failed with status 500.',
    );

    expect(normalizeApiError({}).message).toBe('Network connection failed.');
  });

  it('surfaces a body detail field when present', () => {
    expect(
      normalizeApiError({
        body: { detail: 'Row locked' },
        response: { status: 409, statusText: '' },
      }).detail,
    ).toBe('Row locked');

    expect(
      normalizeApiError({
        body: 'plain text',
        response: { status: 409, statusText: '' },
      }).detail,
    ).toBeUndefined();
  });
});

describe('extractValidation', () => {
  it('returns nothing for non-record bodies', () => {
    expect(extractValidation('nope')).toEqual([]);
    expect(extractValidation({ nothing: true })).toEqual([]);
  });

  it('reads string and object entries from an errors array', () => {
    expect(
      extractValidation({
        errors: [
          'Top level problem',
          { message: 'Bad email', field: 'email' },
          { detail: 'Bad name', property: 'name' },
          { error: 'Bad phone' },
          { nothing: 'useful' },
          42,
        ],
      }),
    ).toEqual([
      { message: 'Top level problem' },
      { field: 'email', message: 'Bad email' },
      { field: 'name', message: 'Bad name' },
      { message: 'Bad phone' },
    ]);
  });

  it('reads keyed arrays and single strings from an errors record', () => {
    expect(
      extractValidation({
        errors: {
          email: ['Required', 'Must be unique', ''],
          name: 'Too short',
          empty: '  ',
          bogus: [1, 2],
        },
      }),
    ).toEqual([
      { field: 'email', message: 'Required' },
      { field: 'email', message: 'Must be unique' },
      { field: 'name', message: 'Too short' },
    ]);
  });
});

describe('isNetworkFailure', () => {
  it('recognizes TypeErrors and network-flavored error messages', () => {
    expect(isNetworkFailure(new TypeError('nope'))).toBe(true);
    expect(isNetworkFailure(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('offline for now'))).toBe(true);
  });

  it('ignores unrelated errors and non-errors', () => {
    expect(isNetworkFailure(new Error('validation failed on server'))).toBe(false);
    expect(isNetworkFailure(new Error('totally unrelated'))).toBe(false);
    expect(isNetworkFailure('string error')).toBe(false);
  });
});

describe('readJsonBody', () => {
  it('skips bodies that are not declared JSON', async () => {
    await expect(readJsonBody(jsonResponse('<html></html>', { contentType: 'text/html' }))).resolves.toBeUndefined();
  });

  it('parses declared JSON bodies', async () => {
    await expect(readJsonBody(jsonResponse({ ok: true }))).resolves.toEqual({
      ok: true,
    });
  });

  it('swallows malformed JSON bodies', async () => {
    await expect(readJsonBody(jsonResponse('{not json', {}))).resolves.toBeUndefined();
  });

  it('treats a missing content-type header as non-JSON', async () => {
    await expect(readJsonBody(new Response(null, { status: 200 }))).resolves.toBeUndefined();
  });
});

describe('enrichJsonResponse', () => {
  it('merges the frontend error into record bodies', async () => {
    const normalized = normalizeApiError({
      body: { code: 'boom' },
      response: { status: 500, statusText: '' },
    });
    const enriched = await enrichJsonResponse(jsonResponse({ code: 'boom', detail: 'kept' }), normalized);
    const body = (await enriched.json()) as Record<string, unknown>;

    expect(body['detail']).toBe('kept');
    expect(body[FrontendErrorKey]).toMatchObject({ code: 'boom' });
    expect(enriched.headers.get('content-type')).toBe('application/json');
  });

  it('wraps non-record bodies in a fresh frontend-error envelope', async () => {
    const normalized = normalizeApiError({
      response: { status: 500, statusText: '' },
    });
    const enriched = await enrichJsonResponse(jsonResponse('plain text', { contentType: 'text/plain' }), normalized);
    const body = (await enriched.json()) as Record<string, unknown>;

    expect(Object.keys(body)).toEqual([FrontendErrorKey]);
  });
});
