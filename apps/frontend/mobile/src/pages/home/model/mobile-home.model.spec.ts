import { describe, expect, it } from 'vitest';

import { mobileCapabilityCards, mobileLocaleOptions } from './mobile-home.model';

describe('mobile home model', () => {
  it('keeps the launch surface backed by concrete setup cards', () => {
    expect(mobileCapabilityCards.map((card) => card.valueKey)).toEqual([
      'mobile.card.account.value',
      'mobile.card.native.value',
      'mobile.card.delivery.value',
    ]);
  });

  it('offers the shared en/ru locale switch options', () => {
    expect(mobileLocaleOptions.map((option) => option.locale)).toEqual(['en', 'ru']);
    expect(mobileLocaleOptions.map((option) => option.label)).toEqual(['EN', 'RU']);
  });
});
