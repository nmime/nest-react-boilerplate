// @requirements REQ-FRONTEND-ERROR-005
import { beforeEach, describe, expect, it } from 'vitest';
import { problemTypeForCode, registerProblemTypes } from '@app/common-problem-details';
import { configureApiLocale } from './api-locale';
import { normalizeApiError } from './error-normalization';

// The registry is a module-level singleton and vitest isolates modules per spec file, so a product
// registration here cannot leak into the base-catalog guard in `error-normalization.spec.ts`.
registerProblemTypes({
  id: 'frontend-normalizer-product-problems',
  problems: [
    {
      code: 'marketplace-listing-locked',
      title: 'Listing Locked',
      status: 409,
      detail: 'The listing is locked while an offer is being settled.',
      resolution: 'Retry once the settlement completes.',
      extensions: [{ name: 'code', description: 'Stable short alias for the problem type URI.' }],
    },
  ],
});

describe('normalizing a problem type the product registered', () => {
  beforeEach(() => {
    configureApiLocale({ locale: 'en' });
  });

  // Callers branch on the short alias. Falling through to the full URI means every product-side
  // `error.code === 'marketplace-listing-locked'` check silently never matches.
  it('reports the short alias rather than the type URI', () => {
    const normalized = normalizeApiError({
      body: { type: problemTypeForCode('marketplace-listing-locked'), detail: 'Server-side English copy' },
      response: { status: 409, statusText: '' },
    });

    expect(normalized.code).toBe('marketplace-listing-locked');
  });

  // Resolving the code must not also start deriving a translation key that nothing defines: the
  // user would see `errors.marketplace-listing-locked.detail` instead of a sentence.
  it('falls back to the server detail when the product shipped no translation', () => {
    const normalized = normalizeApiError({
      body: { type: problemTypeForCode('marketplace-listing-locked'), detail: 'Server-side English copy' },
      response: { status: 409, statusText: '' },
    });

    expect(normalized.message).toBe('Server-side English copy');
  });

  it('still translates a base problem type locally instead of trusting server prose', () => {
    const normalized = normalizeApiError({
      body: { type: problemTypeForCode('step-up-required'), detail: 'Server-side English copy' },
      response: { status: 403, statusText: '' },
    });

    expect(normalized.message).toBe('Authenticate again before performing this security-sensitive action.');
  });
});
