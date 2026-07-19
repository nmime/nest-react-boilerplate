import { fallbackLocale, type Locale } from '@app/frontend-i18n-shared';

let currentApiLocale: Locale = fallbackLocale;

const resolveAmbientApiLocale = (): Locale => {
  if (typeof document === 'undefined') {
    return currentApiLocale;
  }

  const documentLocale = document.documentElement.lang;
  return documentLocale === 'en' || documentLocale === 'ru' ? documentLocale : currentApiLocale;
};

let apiLocaleGetter: () => Locale = resolveAmbientApiLocale;

export interface ConfigureApiLocaleOptions {
  getLocale?: () => Locale;
  locale?: Locale;
}

export const setApiLocale = (locale: Locale): void => {
  currentApiLocale = locale;
};

export const configureApiLocale = ({ getLocale, locale }: ConfigureApiLocaleOptions): void => {
  if (locale) {
    setApiLocale(locale);
  }
  apiLocaleGetter = getLocale ?? resolveAmbientApiLocale;
};

export const getApiLocale = (): Locale => apiLocaleGetter();
