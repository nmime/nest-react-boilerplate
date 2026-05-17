import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { configureApiLocale, setApiLocale } from "../api/api-client";
import {
  fallbackLocale,
  resolveLocale,
  supportedLocales,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from "@app/common/i18n";

const LocaleStorageKey = "boilerplate.locale";

export interface FrontendI18nContextValue {
  locale: Locale;
  supportedLocales: readonly Locale[];
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function readStoredLocale(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage?.getItem(LocaleStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

function persistLocale(locale: Locale): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(LocaleStorageKey, locale);
    } catch {
      // Storage can be unavailable in SSR, privacy modes, or tests.
    }
  }
  if (typeof document !== "undefined") {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
  }
}

export function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") {
    return fallbackLocale;
  }

  const queryLocale =
    new URL(window.location.href).searchParams.get("lang") ??
    new URL(window.location.href).searchParams.get("locale");

  return resolveLocale(
    queryLocale,
    readStoredLocale(),
    readCookie("locale"),
    readCookie("lang"),
    window.navigator.languages?.join(","),
    window.navigator.language,
  );
}

const fallbackContext: FrontendI18nContextValue = {
  locale: fallbackLocale,
  supportedLocales,
  setLocale: () => undefined,
  t: (key, params) => translate(key, { locale: fallbackLocale, params }),
};

const FrontendI18nContext =
  createContext<FrontendI18nContextValue>(fallbackContext);

export interface FrontendI18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
  userLocale?: Locale | null;
  onLocaleChange?: (locale: Locale) => Promise<void> | void;
}

export function FrontendI18nProvider({
  children,
  initialLocale,
  onLocaleChange,
  userLocale,
}: Readonly<FrontendI18nProviderProps>) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const resolvedLocale = userLocale ?? initialLocale ?? detectBrowserLocale();
    configureApiLocale({ locale: resolvedLocale });
    return resolvedLocale;
  });

  useEffect(() => {
    configureApiLocale({ getLocale: () => locale });
  }, [locale]);

  useEffect(() => {
    if (userLocale) {
      configureApiLocale({ locale: userLocale });
      setLocaleState(userLocale);
      persistLocale(userLocale);
    }
  }, [userLocale]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      setApiLocale(nextLocale);
      setLocaleState(nextLocale);
      persistLocale(nextLocale);
      void onLocaleChange?.(nextLocale);
    },
    [onLocaleChange],
  );

  const value = useMemo<FrontendI18nContextValue>(
    () => ({
      locale,
      setLocale,
      supportedLocales,
      t: (key, params) => translate(key, { locale, params }),
    }),
    [locale, setLocale],
  );

  return (
    <FrontendI18nContext.Provider value={value}>
      {children}
    </FrontendI18nContext.Provider>
  );
}

export function useI18n(): FrontendI18nContextValue {
  return useContext(FrontendI18nContext);
}

export function LanguageSwitcher() {
  const { locale, setLocale, supportedLocales: locales, t } = useI18n();

  return (
    <label className="xr-language-switcher">
      <span>{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        onChange={(event) => setLocale(event.currentTarget.value as Locale)}
        value={locale}
      >
        {locales.map((nextLocale) => (
          <option key={nextLocale} value={nextLocale}>
            {t(`common.language.${nextLocale}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
