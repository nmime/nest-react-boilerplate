/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { observer } from "mobx-react-lite";
import {
  fallbackLocale,
  supportedLocales,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationParams,
} from "./locale";
import {
  createRootStore,
  detectBrowserLocale,
  useOptionalRootStore,
  type UiTheme,
  type RootStore,
} from "../state";
import { UiSelect } from "../component/select";

export {
  createDomainTranslationKey,
  createDomainTranslator,
  type DomainNamespace,
  type DomainTranslate,
} from "./domain-namespace";

export { detectBrowserLocale } from "../state";

export interface FrontendI18nContextValue {
  locale: Locale;
  supportedLocales: readonly Locale[];
  setLocale: (locale: Locale) => void;
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const fallbackContext: FrontendI18nContextValue = {
  locale: fallbackLocale,
  supportedLocales,
  setLocale: () => undefined,
  theme: "system",
  setTheme: () => undefined,
  t: (key, params) => translate(key, { locale: fallbackLocale, params }),
};

const FrontendI18nContext =
  createContext<FrontendI18nContextValue>(fallbackContext);

export interface FrontendI18nProviderProps {
  children: ReactNode;
  initialLocale?: Locale;
  initialTheme?: UiTheme;
  userLocale?: Locale | null;
  userTheme?: UiTheme | null;
  onLocaleChange?: (locale: Locale) => Promise<void> | void;
  onThemeChange?: (theme: UiTheme) => Promise<void> | void;
}

const createI18nRootStore = ({
  initialLocale,
  initialTheme,
  userLocale,
  userTheme,
}: Pick<
  FrontendI18nProviderProps,
  "initialLocale" | "initialTheme" | "userLocale" | "userTheme"
>): RootStore =>
  createRootStore({
    initialLocale: userLocale ?? initialLocale ?? detectBrowserLocale(),
    initialTheme: userTheme ?? initialTheme,
  });

export const FrontendI18nProvider = observer(function FrontendI18nProvider({
  children,
  initialLocale,
  initialTheme,
  onLocaleChange,
  onThemeChange,
  userLocale,
  userTheme,
}: Readonly<FrontendI18nProviderProps>) {
  const providedRootStore = useOptionalRootStore();
  const [ownedRootStore] = useState<RootStore | null>(() =>
    providedRootStore
      ? null
      : createI18nRootStore({
          initialLocale,
          initialTheme,
          userLocale,
          userTheme,
        }),
  );
  const rootStore = providedRootStore ?? ownedRootStore;
  const localeStore = rootStore?.locale;
  const uiStore = rootStore?.ui;

  if (!localeStore || !uiStore) {
    throw new Error(
      "FrontendI18nProvider could not resolve a frontend state store.",
    );
  }
  const { locale } = localeStore;
  const { theme } = uiStore;

  useEffect(() => {
    if (userLocale) {
      localeStore.applyUserLocale(userLocale);
    }
  }, [localeStore, userLocale]);

  useEffect(() => {
    if (userTheme) {
      uiStore.applyUserTheme(userTheme);
    }
  }, [uiStore, userTheme]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      localeStore.setLocale(nextLocale);
      void onLocaleChange?.(nextLocale);
    },
    [localeStore, onLocaleChange],
  );
  const setTheme = useCallback(
    (nextTheme: UiTheme) => {
      uiStore.setTheme(nextTheme);
      void onThemeChange?.(nextTheme);
    },
    [onThemeChange, uiStore],
  );

  const value = useMemo<FrontendI18nContextValue>(
    () => ({
      locale,
      setLocale,
      theme,
      setTheme,
      supportedLocales: localeStore.supportedLocales,
      t: (key, params) => translate(key, { locale, params }),
    }),
    [locale, localeStore.supportedLocales, setLocale, setTheme, theme],
  );

  return (
    <FrontendI18nContext.Provider value={value}>
      {children}
    </FrontendI18nContext.Provider>
  );
});

export function useI18n(): FrontendI18nContextValue {
  return useContext(FrontendI18nContext);
}

export const LanguageSwitcher = observer(function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const locales = supportedLocales;

  return (
    <UiSelect
      aria-label={t("common.language")}
      className="xr-language-switcher"
      label={t("common.language")}
      onValueChange={(value) => setLocale(value as Locale)}
      options={locales.map((nextLocale) => ({
        label: t(`common.language.${nextLocale}`),
        value: nextLocale,
      }))}
      value={locale}
    />
  );
});

const supportedThemes: readonly UiTheme[] = ["system", "light", "dark"];

export const ThemeSwitcher = observer(function ThemeSwitcher() {
  const { setTheme, t, theme } = useI18n();

  return (
    <UiSelect
      aria-label={t("common.theme")}
      className="xr-theme-switcher"
      label={t("common.theme")}
      onValueChange={(value) => setTheme(value as UiTheme)}
      options={supportedThemes.map((nextTheme) => ({
        label: t(`common.theme.${nextTheme}`),
        value: nextTheme,
      }))}
      value={theme}
    />
  );
});
