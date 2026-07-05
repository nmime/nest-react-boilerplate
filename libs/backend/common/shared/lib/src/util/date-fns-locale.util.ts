export const normalizeDateLocale = (locale = "en"): string =>
  locale.split("-")[0] as string;
