export const mobileRuntime = {
  platforms: ['ios', 'android', 'web'],
  nativeUiPackage: '@app/frontend-ui-native',
  apiBaseUrlEnv: 'EXPO_PUBLIC_API_BASE_URL',
} as const;

export const mobileCapabilityCards = [
  {
    labelKey: 'mobile.card.account.label',
    valueKey: 'mobile.card.account.value',
    detailKey: 'mobile.card.account.detail',
  },
  {
    labelKey: 'mobile.card.native.label',
    valueKey: 'mobile.card.native.value',
    detailKey: 'mobile.card.native.detail',
  },
  {
    labelKey: 'mobile.card.delivery.label',
    valueKey: 'mobile.card.delivery.value',
    detailKey: 'mobile.card.delivery.detail',
  },
] as const;

export type MobileCapabilityCard = (typeof mobileCapabilityCards)[number];
