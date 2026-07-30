// @requirements REQ-FRONTEND-ERROR-005
import { beforeEach, describe, expect, it } from 'vitest';

import { configureApiLocale } from './api-locale';
import {
  FrontendErrorKey,
  enrichJsonResponse,
  extractValidation,
  getApiErrorDisplayMessage,
  getNormalizedApiError,
  isNetworkFailure,
  normalizeApiError,
  readJsonBody,
} from './error-normalization';

beforeEach(() => {
  configureApiLocale({ locale: 'en' });
});

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
      message: 'Network connection failed.',
      method: 'GET',
      status: null,
    });
    expect(error.id).toBe('GET:/profile:network:network.offline');
  });

  it('separates unexpected request errors from NET transport failures', () => {
    const error = normalizeApiError({
      endpoint: '/profile',
      error: new Error('unexpected client hook failure'),
      method: 'patch',
    });

    expect(error).toMatchObject({
      code: 'network.error',
      kind: 'unknown',
      message: 'Request failed with ERR.',
      method: 'PATCH',
      status: null,
    });
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

  it('keeps the RFC type URI and exposes its stable short code separately', () => {
    expect(
      normalizeApiError({
        body: {
          type: 'https://example.com/problems#resource-conflict',
          code: 'spoofed',
        },
        response: { status: 409, statusText: '' },
      }),
    ).toMatchObject({
      code: 'resource-conflict',
      type: 'https://example.com/problems#resource-conflict',
    });

    expect(
      normalizeApiError({
        body: { type: 'https://example.com/problems#resource-not-found' },
        response: { status: 404, statusText: '' },
      }).code,
    ).toBe('resource-not-found');

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
    expect(
      normalizeApiError({
        body: { type: 'https://errors.example.test/problems#unknown' },
        response: { status: 418, statusText: '' },
      }).code,
    ).toBe('https://errors.example.test/problems#unknown');
    expect(
      normalizeApiError({
        body: { type: 'about:blank' },
        response: { status: 418, statusText: '' },
      }).code,
    ).toBe('http.418');
  });

  it('translates registered problem details locally instead of trusting server prose', () => {
    const body = {
      type: 'https://example.com/problems#step-up-required',
      detail: 'Server-side English copy',
    };

    expect(normalizeApiError({ body, response: { status: 403, statusText: '' } }).message).toBe(
      'Authenticate again before performing this security-sensitive action.',
    );

    configureApiLocale({ locale: 'ru' });
    expect(normalizeApiError({ body, response: { status: 403, statusText: '' } }).message).toBe(
      'Войдите снова перед выполнением этого действия, связанного с безопасностью.',
    );
  });

  it('uses localized body text and localized safe fallbacks', () => {
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
    ).toBe('Request failed with 500.');

    expect(
      normalizeApiError({
        response: { status: 500, statusText: 'Server Error' },
      }).message,
    ).toBe('Request failed with 500.');

    expect(normalizeApiError({ response: { status: 500, statusText: '' } }).message).toBe('Request failed with 500.');

    configureApiLocale({ locale: 'ru' });
    expect(normalizeApiError({ response: { status: 500, statusText: '' } }).message).toBe(
      'Запрос не удался со статусом 500.',
    );
    expect(normalizeApiError({}).message).toBe('Ошибка сетевого подключения.');
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

describe('normalized API error display', () => {
  const problem = normalizeApiError({
    body: { detail: 'Safe public detail' },
    response: { status: 409, statusText: '' },
  });

  it('reads only normalized client and enriched-response errors', () => {
    expect(getNormalizedApiError({ problem })).toBe(problem);
    expect(getNormalizedApiError({ [FrontendErrorKey]: problem })).toBe(problem);
    expect(getApiErrorDisplayMessage({ problem }, 'Fallback')).toBe('Safe public detail');
  });

  it('rejects arbitrary exception messages and malformed normalized shapes', () => {
    expect(getNormalizedApiError('not-an-error')).toBeUndefined();
    expect(getNormalizedApiError(new Error('secret database message'))).toBeUndefined();
    expect(getNormalizedApiError({ problem: { code: 'bad', message: 'partial' } })).toBeUndefined();
    expect(getApiErrorDisplayMessage(new Error('secret database message'), 'Fallback')).toBe('Fallback');
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
          { message: 'Nested pointer', pointer: '#/profile/~0secret/~1path' },
          { nothing: 'useful' },
          42,
        ],
      }),
    ).toEqual([
      { message: 'Top level problem' },
      { field: 'email', message: 'Bad email' },
      { field: 'name', message: 'Bad name' },
      { message: 'Bad phone' },
      { field: 'profile.~secret./path', message: 'Nested pointer' },
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
