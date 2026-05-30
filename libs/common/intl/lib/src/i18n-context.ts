export interface IntlContextValue {
  locale: string;
  fallbackLocale: string;
}

export class IntlContext {
  private static fallbackLocale = "en";

  static resolve(
    locale: string | undefined,
    fallbackLocale = IntlContext.fallbackLocale,
  ): IntlContextValue {
    return {
      locale: locale?.trim() || fallbackLocale,
      fallbackLocale,
    };
  }
}
