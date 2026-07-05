import {
  observer,
  supportedLocales,
  useI18n,
  type Locale,
  type UiTheme,
} from "@app/frontend-runtime";
import { UiSelect } from "./select";

export const LanguageSwitcher = observer(function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <UiSelect
      aria-label={t("common.language")}
      className="xr-language-switcher"
      label={t("common.language")}
      onValueChange={(value) => {
        setLocale(value as Locale);
      }}
      options={supportedLocales.map((nextLocale) => ({
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
      onValueChange={(value) => {
        setTheme(value as UiTheme);
      }}
      options={supportedThemes.map((nextTheme) => ({
        label: t(`common.theme.${nextTheme}`),
        value: nextTheme,
      }))}
      value={theme}
    />
  );
});
