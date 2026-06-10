import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeStorageKey } from "./ui-store";
import {
  AuthShellStore,
  LocaleStorageKey,
  LocaleStore,
  createRootStore,
  detectBrowserLocale,
} from "./index";

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}

function setNavigatorLocale(
  languages: string[] = ["en-US"],
  language = languages[0] ?? "en-US",
) {
  Object.defineProperty(window, "navigator", {
    configurable: true,
    value: {
      ...window.navigator,
      language,
      languages,
    },
  });
}

function setSystemTheme(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      addEventListener: vi.fn(),
      matches,
      media: "(prefers-color-scheme: dark)",
      removeEventListener: vi.fn(),
    })),
  });
}

describe("frontend auth and locale state", () => {
  afterEach(() => {
    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
    document.documentElement.lang = "";
    delete document.documentElement.dataset["theme"];
    delete document.documentElement.dataset["themePreference"];
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
  });

  it("normalizes bearer tokens for auth shell state", () => {
    const store = new AuthShellStore("  bearer-token  ");

    expect(store.bearerToken).toBe("bearer-token");
    expect(store.isAuthenticated).toBe(true);

    store.setBearerToken("   ");
    expect(store.bearerToken).toBeNull();
    expect(store.isAuthenticated).toBe(false);

    store.setBearerToken("\n next-token\t");
    expect(store.bearerToken).toBe("next-token");

    store.clearBearerToken();
    expect(store.bearerToken).toBeNull();
  });

  it("persists locale changes and applies document language", () => {
    installStorage();
    const store = new LocaleStore("en");

    store.setLocale("ru");

    expect(window.localStorage.getItem(LocaleStorageKey)).toBe("ru");
    expect(document.cookie).toContain("locale=ru");
    expect(document.documentElement.lang).toBe("ru");
  });

  it("prioritizes query, storage, cookie, then navigator locale detection", () => {
    installStorage();
    setNavigatorLocale(["ru-RU", "en-US"]);
    window.localStorage.setItem(LocaleStorageKey, "en");
    document.cookie = "locale=ru; path=/";
    document.cookie = "lang=ru; path=/";

    window.history.replaceState({}, "", "/?locale=ru");
    expect(detectBrowserLocale()).toBe("ru");

    window.history.replaceState({}, "", "/");
    expect(detectBrowserLocale()).toBe("en");

    window.localStorage.removeItem(LocaleStorageKey);
    expect(detectBrowserLocale()).toBe("ru");

    document.cookie = "locale=; path=/; max-age=0";
    document.cookie = "lang=; path=/; max-age=0";
    expect(detectBrowserLocale()).toBe("ru");
  });

  it("coordinates root store bearer token, locale, and theme state", () => {
    installStorage();
    setSystemTheme(false);

    const store = createRootStore({
      initialBearerToken: "  root-token  ",
      initialLocale: "ru",
      initialTheme: "dark",
    });

    expect(store.authShell.bearerToken).toBe("root-token");
    expect(store.authShell.isAuthenticated).toBe(true);
    expect(store.locale.locale).toBe("ru");
    expect(store.ui.theme).toBe("dark");
    expect(document.documentElement.lang).toBe("ru");
    expect(document.documentElement.dataset["themePreference"]).toBe("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");

    store.locale.setLocale("en");
    store.ui.setTheme("system");

    expect(window.localStorage.getItem(LocaleStorageKey)).toBe("en");
    expect(window.localStorage.getItem(ThemeStorageKey)).toBe("system");
  });
});
