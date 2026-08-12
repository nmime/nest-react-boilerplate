// @requirements REQ-FRONTEND-NATIVE-006
import { describe, expect, it } from 'vitest';
import { supportedLocales } from '@app/frontend-runtime';

import { mobileCapabilityCards, mobileLocaleOptions } from './mobile-home.model';

describe('mobile home model', () => {
  it('keeps the launch surface backed by concrete setup cards', () => {
    expect(mobileCapabilityCards.map((card) => card.valueKey)).toEqual([
      'mobile.card.account.value',
      'mobile.card.native.value',
      'mobile.card.delivery.value',
    ]);
  });

  it('offers every configured locale, in the order the workspace declares them', () => {
    expect(mobileLocaleOptions.map((option) => option.locale)).toEqual([...supportedLocales]);
  });

  // `toUpperCase()` rendered a script-qualified locale as "UZ-CYRL"; the endonym is what a switcher
  // is supposed to show, and it needs no per-locale catalog entry.
  it('labels each locale with its endonym rather than an uppercased tag', () => {
    expect(mobileLocaleOptions.find((option) => option.locale === 'en')?.label).toBe('English');
    expect(mobileLocaleOptions.map((option) => option.label)).not.toContain('EN');
  });
});
