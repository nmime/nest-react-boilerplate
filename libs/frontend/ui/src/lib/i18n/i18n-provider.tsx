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
} from "@app/common/i18n";
import {
  createRootStore,
  detectBrowserLocale,
  useOptionalRootStore,
  type RootStore,
} from "../state";

export { detectBrowserLocale } from "../state";

export interface FrontendI18nContextValue {
  locale: Locale;
  supportedLocales: readonly Locale[];
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
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

const createI18nRootStore = ({
  initialLocale,
  userLocale,
}: Pick<
  FrontendI18nProviderProps,
  "initialLocale" | "userLocale"
>): RootStore =>
  createRootStore({
    initialLocale: userLocale ?? initialLocale ?? detectBrowserLocale(),
  });

export const FrontendI18nProvider = observer(function FrontendI18nProvider({
  children,
  initialLocale,
  onLocaleChange,
  userLocale,
}: Readonly<FrontendI18nProviderProps>) {
  const providedRootStore = useOptionalRootStore();
  const [ownedRootStore] = useState<RootStore | null>(() =>
    providedRootStore
      ? null
      : createI18nRootStore({ initialLocale, userLocale }),
  );
  const localeStore = (providedRootStore ?? ownedRootStore)?.locale;

  if (!localeStore) {
    throw new Error(
      "FrontendI18nProvider could not resolve a frontend state store.",
    );
  }
  const { locale } = localeStore;

  useEffect(() => {
    if (userLocale) {
      localeStore.applyUserLocale(userLocale);
    }
  }, [localeStore, userLocale]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      localeStore.setLocale(nextLocale);
      void onLocaleChange?.(nextLocale);
    },
    [localeStore, onLocaleChange],
  );

  const value = useMemo<FrontendI18nContextValue>(
    () => ({
      locale,
      setLocale,
      supportedLocales: localeStore.supportedLocales,
      t: (key, params) => translate(key, { locale, params }),
    }),
    [locale, localeStore.supportedLocales, setLocale],
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
  const { locale, setLocale, supportedLocales: locales, t } = useI18n();

  return (
    <label>
      {t("common.language")}
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
});
