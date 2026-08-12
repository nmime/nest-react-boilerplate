import { supportedLocales, type Locale } from '@app/frontend-runtime';
import { localeLabel } from '@app/frontend-i18n-shared';

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

/**
 * Locales offered by the home-screen switcher (drives the shared preference
 * model). Derived from the single-source `supportedLocales` list rather than a
 * hand-maintained enumeration, so a new locale surfaces here automatically.
 * The label is the endonym: uppercasing the tag rendered `uz-cyrl` as "UZ-CYRL",
 * and the shared helper degrades to the canonical tag where Hermes ships without
 * `Intl.DisplayNames`.
 */
export const mobileLocaleOptions: ReadonlyArray<{ locale: Locale; label: string }> = supportedLocales.map((locale) => ({
  locale,
  label: localeLabel(locale),
}));
