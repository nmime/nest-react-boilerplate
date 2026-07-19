import { describe, expect, it } from 'vitest';
import { ProblemTypeBaseUrl, problemTypeForCode } from './problem-type-base-url.const';

describe('problem type namespace', () => {
  it('uses a product-domain placeholder without repository identity', () => {
    const repositoryIdentity = ['nest', 'react', 'boilerplate'].join('-');

    expect(ProblemTypeBaseUrl).toBe('https://example.com/problems');
    expect(problemTypeForCode('not-found')).toBe('https://example.com/problems/not-found');
    expect(problemTypeForCode('not-found')).not.toContain(repositoryIdentity);
  });

  it.each(['', 'not a uri', '/not-found', 'NotFound', 'not.found'])('rejects invalid problem code %j', (code) => {
    expect(() => problemTypeForCode(code)).toThrow(TypeError);
  });
});
