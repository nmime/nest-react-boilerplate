import type { Locale } from '@app/frontend-runtime';

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

/** Locales offered by the home-screen switcher (drives the shared preference model). */
export const mobileLocaleOptions: ReadonlyArray<{ locale: Locale; label: string }> = [
  { locale: 'en', label: 'EN' },
  { locale: 'ru', label: 'RU' },
];
