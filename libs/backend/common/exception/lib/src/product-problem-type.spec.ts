// @requirements REQ-API-PROBLEM-001
// Evidence for: REQ-API-PROBLEM-001
import { describe, expect, it } from 'vitest';
import { registerProblemTypes } from '@app/common-problem-details';
import { Exception, ExceptionKind } from './abstract';

registerProblemTypes({
  id: 'exception-lib-product-problem',
  problems: [
    {
      code: 'provider-unavailable',
      title: 'Provider Unavailable',
      status: 503,
      detail: 'The requested provider capability is temporarily unavailable or disabled.',
      resolution: 'Retry only when the disclosed capability state reports the provider as retryable.',
      extensions: [{ name: 'code', description: 'Stable short alias for the problem type URI.' }],
    },
  ],
});

class ProviderUnavailableException extends Exception({
  name: 'ProviderUnavailableException',
  kind: ExceptionKind.Server,
  problemType: 'provider-unavailable',
}) {}

describe('product problem types', () => {
  it('builds an exception class from a problem type the product registered', () => {
    const problem = new ProviderUnavailableException().toProblemDetails();

    expect(problem).toMatchObject({
      type: 'https://example.com/problems#provider-unavailable',
      title: 'Provider Unavailable',
      status: 503,
      code: 'provider-unavailable',
    });
  });

  it('still refuses a problem type nobody registered', () => {
    expect(() =>
      Exception({ name: 'UnknownException', kind: ExceptionKind.Client, problemType: 'never-registered' }),
    ).toThrow('is not documented in the shared registry');
  });
});
