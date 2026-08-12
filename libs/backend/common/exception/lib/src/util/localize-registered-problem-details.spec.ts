// @requirements REQ-API-PROBLEM-001
import { describe, expect, it } from 'vitest';
import { problemTypeForCode, registerProblemTypes } from '@app/common-problem-details';
import { localizeProblemDetails, resolveProblemContentLanguage } from './localize-problem-details.util';

// The registry is a module-level singleton, so registration happens once at load like the sibling
// `product-problem-type.spec.ts`. Two statuses are covered on purpose: 409 is in the status→code map
// and has `errors.conflict.*` translations, which is what a registered type used to be overwritten
// by; 503 has no mapped translations, which is what proves the fallback still works.
registerProblemTypes({
  id: 'localizer-product-problems',
  problems: [
    {
      code: 'marketplace-listing-locked',
      title: 'Listing Locked',
      status: 409,
      detail: 'The listing is locked while an offer is being settled.',
      resolution: 'Retry once the settlement completes.',
      extensions: [{ name: 'code', description: 'Stable short alias for the problem type URI.' }],
    },
    {
      code: 'marketplace-pricing-offline',
      title: 'Pricing Offline',
      status: 503,
      detail: 'The pricing service is temporarily unavailable.',
      resolution: 'Retry after the disclosed interval.',
      extensions: [{ name: 'code', description: 'Stable short alias for the problem type URI.' }],
    },
  ],
});

const lockedProblem = {
  type: problemTypeForCode('marketplace-listing-locked'),
  title: 'Listing Locked',
  status: 409,
  detail: 'The listing is locked while an offer is being settled.',
  code: 'marketplace-listing-locked',
};

describe('localizing a problem type the product registered', () => {
  // `problem-details-schema.util.ts` publishes `code` as required for registered types, so dropping
  // it makes the runtime response violate the OpenAPI document this repo generates from the catalog.
  it('keeps the short code the registry assigned', () => {
    expect(localizeProblemDetails(lockedProblem).code).toBe('marketplace-listing-locked');
  });

  // The status→code fallback exists for `about:blank`. Applying it to a type that resolves would
  // replace the product's own wording with the generic status text for that status.
  it('keeps the registered wording instead of borrowing the generic status text', () => {
    const localized = localizeProblemDetails(lockedProblem, 'en');

    expect(localized.title).toBe('Listing Locked');
    expect(localized.detail).toBe('The listing is locked while an offer is being settled.');
  });

  it('keeps the registered wording in a non-default locale too', () => {
    const localized = localizeProblemDetails(lockedProblem, 'ru');

    expect(localized.title).toBe('Listing Locked');
    expect(localized.detail).toBe('The listing is locked while an offer is being settled.');
  });

  it('reports the default content language for a registered type nothing translates', () => {
    expect(resolveProblemContentLanguage(lockedProblem, 'ru')).toBe('en');
  });

  it('keeps a registered type whose status has no generic translation intact', () => {
    const localized = localizeProblemDetails({
      type: problemTypeForCode('marketplace-pricing-offline'),
      title: 'Pricing Offline',
      status: 503,
      detail: 'The pricing service is temporarily unavailable.',
      code: 'marketplace-pricing-offline',
    });

    expect(localized.code).toBe('marketplace-pricing-offline');
    expect(localized.title).toBe('Pricing Offline');
  });
});

describe('localizing a problem the catalog does not describe', () => {
  // Unchanged behaviour: `about:blank` and any unknown URI still borrow the status-generic text,
  // which is the whole reason the status map exists.
  it('still falls back to the generic text for an unresolvable type', () => {
    const localized = localizeProblemDetails({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'something happened',
    });

    expect(localized.title).toBe('Conflict');
    expect(localized.code).toBeUndefined();
  });

  // Anti-spoofing: `code` is re-derived from the catalog, never trusted from the inbound member.
  it('refuses a code member the caller supplied for an unresolvable type', () => {
    const localized = localizeProblemDetails({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'something happened',
      code: 'marketplace-listing-locked',
    });

    expect(localized.code).toBeUndefined();
  });
});
