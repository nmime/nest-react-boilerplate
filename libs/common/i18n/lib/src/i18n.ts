import { translations, type Locale, type TranslationKey } from "./locales";

export { localeCatalogFileNames, translations } from "./locales";
export type { Locale, LocaleCatalog, TranslationKey } from "./locales";

export type TranslationParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const fallbackLocale: Locale = "en";
export const supportedLocales = Object.keys(translations) as Locale[];

export interface TranslateOptions {
  locale?: string | null;
  params?: TranslationParams;
}

export interface LocaleRequestSource {
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, unknown>;
  language?: string;
  locale?: string;
  url?: string;
  originalUrl?: string;
}

const supportedLocaleSet = new Set<string>(supportedLocales);

export function normalizeLocale(
  value: string | null | undefined,
): Locale | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (!normalized) {
    return undefined;
  }

  const candidates = [normalized, normalized.split("-")[0]];
  return candidates.find((candidate): candidate is Locale =>
    supportedLocaleSet.has(candidate),
  );
}

export function parseAcceptLanguage(
  value: string | null | undefined,
): Locale | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((part) => {
      const [localePart, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      return {
        locale: normalizeLocale(localePart),
        quality: quality ? Number.parseFloat(quality.slice(2)) : 1,
      };
    })
    .filter(
      (entry): entry is { locale: Locale; quality: number } =>
        Boolean(entry.locale) &&
        Number.isFinite(entry.quality) &&
        entry.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality)[0]?.locale;
}

export function resolveLocale(
  ...values: Array<string | null | undefined>
): Locale {
  for (const value of values) {
    const locale = normalizeLocale(value) ?? parseAcceptLanguage(value);
    if (locale) {
      return locale;
    }
  }

  return fallbackLocale;
}

function firstHeader(
  headers: LocaleRequestSource["headers"],
  name: string,
): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return firstQueryValue(value[0]);
  }

  return typeof value === "string" ? value : undefined;
}

function localeFromUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "http://localhost");
    return (
      parsed.searchParams.get("lang") ??
      parsed.searchParams.get("locale") ??
      undefined
    );
  } catch {
    return undefined;
  }
}

function firstCookieValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
  return resolveLocale(
    firstQueryValue(source.query?.lang),
    firstQueryValue(source.query?.locale),
    localeFromUrl(source.originalUrl ?? source.url),
    firstHeader(source.headers, "x-locale"),
    firstHeader(source.headers, "x-language"),
    firstCookieValue(source.cookies?.locale),
    firstCookieValue(source.cookies?.lang),
    source.locale,
    source.language,
    firstHeader(source.headers, "accept-language"),
  );
}

export function hasTranslationKey(key: string): key is TranslationKey {
  return key in translations[fallbackLocale];
}

export function interpolate(
  message: string,
  params: TranslationParams = {},
): string {
  return message.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export function translate(
  key: TranslationKey,
  { locale = fallbackLocale, params = {} }: TranslateOptions = {},
): string {
  const resolvedLocale = normalizeLocale(locale) ?? fallbackLocale;
  /* v8 ignore next 3 -- locale bundles intentionally fall back to English for untranslated optional copy. */
  const message =
    translations[resolvedLocale][key] ??
    /* v8 ignore next -- locale bundles intentionally fall back to English for untranslated optional copy. */
    translations[fallbackLocale][key];
  return interpolate(message, params);
}

export class I18nService {
  readonly fallbackLocale = fallbackLocale;
  readonly supportedLocales = supportedLocales;

  translate(key: TranslationKey, options: TranslateOptions = {}): string {
    return translate(key, options);
  }

  resolveLocale(...values: Array<string | null | undefined>): Locale {
    return resolveLocale(...values);
  }

  resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
    return resolveLocaleFromRequest(source);
  }
}

export function createRequestLocaleMiddleware(i18n = new I18nService()) {
  return (
    request: LocaleRequestSource,
    _response: unknown,
    next: () => void,
  ): void => {
    const locale = i18n.resolveLocaleFromRequest(request);
    request.locale = locale;
    request.language = locale;
    next();
  };
}
