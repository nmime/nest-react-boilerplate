import { describe, expect, it } from 'vitest';
import {
  getProblemTypeDefinition,
  isProblemCode,
  isRequestId,
  isUriReference,
  ProblemTypeDefinitions,
  ProblemTypeDocumentationUrl,
  problemCodeFromType,
  ProblemInstanceBaseUrl,
  problemInstanceForRequestId,
  problemTypeForCode,
} from './index';

describe('RFC 9457 problem details contract', () => {
  it('keeps problem identities on generic product-domain documentation paths', () => {
    const documentationUrl = new URL(ProblemTypeDocumentationUrl);
    const instanceBaseUrl = new URL(ProblemInstanceBaseUrl);

    expect(documentationUrl).toMatchObject({ hostname: 'example.com', pathname: '/problems' });
    expect(instanceBaseUrl).toMatchObject({ hostname: 'example.com', pathname: '/problem-instances' });
    expect(instanceBaseUrl.origin).toBe(documentationUrl.origin);
  });

  it('defines unique documented problem types with matching HTTPS fragment identities', () => {
    expect(new Set(ProblemTypeDefinitions.map(({ code }) => code)).size).toBe(ProblemTypeDefinitions.length);

    for (const definition of ProblemTypeDefinitions) {
      expect(problemTypeForCode(definition.code)).toBe(`${ProblemTypeDocumentationUrl}#${definition.code}`);
      expect(definition.status).toBeGreaterThanOrEqual(400);
      expect(definition.status).toBeLessThanOrEqual(599);
      expect(definition.title).not.toBe('');
      expect(definition.resolution).not.toBe('');
      expect(getProblemTypeDefinition(definition.code)).toEqual(definition);
      expect(problemCodeFromType(problemTypeForCode(definition.code))).toBe(definition.code);
    }
  });

  it('does not invent a custom code for about:blank or unknown types', () => {
    expect(problemCodeFromType('about:blank')).toBeUndefined();
    expect(problemCodeFromType('https://errors.example.test/problems#unknown')).toBeUndefined();
  });

  it.each(['', 'not a uri', '/not-found', 'NotFound', 'not_found', 'not.found', `a${'b'.repeat(64)}`])(
    'rejects invalid problem code %j',
    (code) => {
      expect(isProblemCode(code)).toBe(false);
      expect(() => problemTypeForCode(code)).toThrow(TypeError);
    },
  );

  it('creates absolute opaque occurrence URIs only from safe request identifiers', () => {
    expect(problemInstanceForRequestId('request-123')).toBe('https://example.com/problem-instances/request-123');
    expect(problemInstanceForRequestId('trace:span')).toBe('https://example.com/problem-instances/trace%3Aspan');
    expect(() => problemInstanceForRequestId('request id')).toThrow(TypeError);
    expect(() => problemInstanceForRequestId('a'.repeat(129))).toThrow(TypeError);
    expect(isRequestId('request-123')).toBe(true);
    expect(isRequestId('request id')).toBe(false);
  });

  it.each([
    'about:blank',
    'https://example.com/problems#not-found',
    '/problem-instances/request-123',
    '#/profile/email',
  ])('accepts URI reference %j', (value) => {
    expect(isUriReference(value)).toBe(true);
  });

  it.each(['', 'not a uri', '%', '%ZZ', 'https://example.com/problems\nsecret', 'https://example.com/проблема'])(
    'rejects invalid URI reference %j',
    (value) => {
      expect(isUriReference(value)).toBe(false);
    },
  );
});
