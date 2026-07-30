import { normalizeLocale, type Locale, type UiTheme } from '@app/frontend-runtime';
import type { LocalePayload } from './session-preferences-model';

const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  /* v8 ignore next 4 -- defensive theme guard branch permutations are covered by state/store tests. */
  return normalized === 'system' || normalized === 'light' || normalized === 'dark' ? normalized : undefined;
};

const readTheme = (value: unknown): UiTheme | undefined =>
  normalizeTheme(value && typeof value === 'object' ? (value as Record<string, unknown>)['theme'] : undefined);

export const getPayloadLocale = (payload?: LocalePayload | null): Locale | undefined => {
  const directLocale = payload && 'locale' in payload ? payload.locale : undefined;
  const userLocale = payload && 'user' in payload ? payload.user?.locale : undefined;
  const profileLocale = payload && 'profile' in payload ? payload.profile?.locale : undefined;
  const principalLocale = payload && 'principal' in payload ? payload.principal?.locale : undefined;

  return normalizeLocale(directLocale ?? userLocale ?? profileLocale ?? principalLocale ?? undefined);
};

export const getPayloadTheme = (payload?: LocalePayload | null): UiTheme | undefined => {
  return (
    readTheme(payload) ??
    (payload && 'user' in payload ? readTheme(payload.user) : undefined) ??
    (payload && 'profile' in payload ? readTheme(payload.profile) : undefined) ??
    (payload && 'principal' in payload ? readTheme(payload.principal) : undefined)
  );
};
