import { describe, expect, it } from 'vitest';

import { mobileCapabilityCards, mobileRuntime } from './mobile-home.model';

describe('mobile app setup metadata', () => {
  it('declares native platforms and the shared native UI package', () => {
    expect(mobileRuntime.platforms).toEqual(['ios', 'android', 'web']);
    expect(mobileRuntime.nativeUiPackage).toBe('@app/frontend-ui-native');
  });

  it('keeps the launch surface backed by concrete setup cards', () => {
    expect(mobileCapabilityCards.map((card) => card.valueKey)).toEqual([
      'mobile.card.account.value',
      'mobile.card.native.value',
      'mobile.card.delivery.value',
    ]);
  });
});
