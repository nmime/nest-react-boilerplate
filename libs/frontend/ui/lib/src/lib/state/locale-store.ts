/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { makeAutoObservable } from "mobx";
import {
  fallbackLocale,
  resolveLocale,
  supportedLocales,
  type Locale,
} from "@app/common/i18n";
import { configureApiLocale, setApiLocale } from "../api/api-client";

export const LocaleStorageKey = "boilerplate.locale";

function applyLocaleToDocument(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
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

export function persistLocale(locale: Locale): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(LocaleStorageKey, locale);
    } catch {
      // Ignore storage failures in private browsing or SSR shims.
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

  const url = new URL(window.location.href);
  const queryLocale =
    url.searchParams.get("lang") ?? url.searchParams.get("locale");

  return resolveLocale(
    queryLocale,
    readStoredLocale(),
    readCookie("locale"),
    readCookie("lang"),
    window.navigator.languages?.join(","),
    window.navigator.language,
  );
}

export class LocaleStore {
  locale: Locale;
  readonly supportedLocales = supportedLocales;

  constructor(initialLocale?: Locale | null) {
    this.locale = initialLocale ?? detectBrowserLocale();
    configureApiLocale({ getLocale: () => this.locale, locale: this.locale });
    applyLocaleToDocument(this.locale);
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setLocale(nextLocale: Locale): void {
    this.locale = nextLocale;
    setApiLocale(nextLocale);
    applyLocaleToDocument(nextLocale);
    persistLocale(nextLocale);
  }

  applyUserLocale(nextLocale?: Locale | null): void {
    if (nextLocale) {
      this.setLocale(nextLocale);
    }
  }
}
