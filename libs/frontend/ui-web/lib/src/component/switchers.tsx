import { Check, ChevronDown, Languages, Lightbulb, Monitor, Moon, Sun } from 'lucide-react';
import { hasFrontendTranslationKey, localeLabel } from '@app/frontend-i18n-shared';
import { observer, supportedLocales, useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { UiButton } from './button';
import { UiDropdownMenu } from './dropdown-menu';
import { UiSelect } from './select';

export interface LanguageSwitcherProps {
  compact?: boolean;
  variant?: 'select' | 'menu';
}

export const LanguageSwitcher = observer(function LanguageSwitcher({
  compact = false,
  variant = 'select',
}: Readonly<LanguageSwitcherProps>) {
  const { locale, setLocale, t } = useI18n();
  // Derived rather than read from the catalog: a `common.language.<locale>` key per locale per
  // catalog is the N x N grid `localeLabel` exists to remove. A catalog entry is still honoured
  // where a product wants its own wording, so the shipped entries keep working as that example.
  const languageLabel = (labelled: Locale) => {
    const key = `common.language.${labelled}`;
    return localeLabel(labelled, {
      displayLocale: locale,
      override: hasFrontendTranslationKey(key) ? t(key) : undefined,
    });
  };
  const languageOptions = supportedLocales.map((nextLocale) => ({
    label: (
      <span className="xr-switcher-menu__option">
        <span>{languageLabel(nextLocale)}</span>
        {nextLocale === locale ? <Check aria-hidden="true" className="xr-switcher-menu__check" size={16} /> : null}
      </span>
    ),
    onSelect: () => {
      setLocale(nextLocale);
    },
  }));

  if (variant === 'menu') {
    return (
      <UiDropdownMenu
        className="xr-language-menu"
        items={languageOptions}
        label={t('common.language')}
        trigger={
          <UiButton aria-label={t('common.language')} className="xr-language-menu-trigger" size="sm" variant="ghost">
            <Languages aria-hidden="true" size={17} strokeWidth={2} />
            <span>{languageLabel(locale)}</span>
            <ChevronDown aria-hidden="true" size={15} strokeWidth={2.2} />
          </UiButton>
        }
      />
    );
  }

  return (
    <UiSelect
      aria-label={t('common.language')}
      className={compact ? 'xr-language-switcher xr-switcher--compact' : 'xr-language-switcher'}
      label={t('common.language')}
      onValueChange={(value) => {
        setLocale(value as Locale);
      }}
      options={supportedLocales.map((nextLocale) => ({ label: languageLabel(nextLocale), value: nextLocale }))}
      value={locale}
    />
  );
});

const supportedThemes: readonly UiTheme[] = ['system', 'light', 'dark'];

const themeIcons = {
  dark: Moon,
  light: Sun,
  system: Monitor,
} as const;

export interface ThemeSwitcherProps {
  variant?: 'select' | 'menu';
}

export const ThemeSwitcher = observer(function ThemeSwitcher({ variant = 'select' }: Readonly<ThemeSwitcherProps>) {
  const { setTheme, t, theme } = useI18n();
  const themeOptions = supportedThemes.map((nextTheme) => {
    const ThemeIcon = themeIcons[nextTheme];

    return {
      label: (
        <span className="xr-switcher-menu__option">
          <ThemeIcon aria-hidden="true" size={16} strokeWidth={2} />
          <span>{t(`common.theme.${nextTheme}`)}</span>
          {nextTheme === theme ? <Check aria-hidden="true" className="xr-switcher-menu__check" size={16} /> : null}
        </span>
      ),
      onSelect: () => {
        setTheme(nextTheme);
      },
    };
  });

  if (variant === 'menu') {
    return (
      <UiDropdownMenu
        className="xr-theme-menu"
        items={themeOptions}
        label={t('common.theme')}
        trigger={
          <UiButton aria-label={t('common.theme')} className="xr-theme-menu-trigger" size="icon" variant="ghost">
            <Lightbulb aria-hidden="true" size={18} strokeWidth={2} />
            <span className="sr-only">{t(`common.theme.${theme}`)}</span>
          </UiButton>
        }
      />
    );
  }

  return (
    <UiSelect
      aria-label={t('common.theme')}
      className="xr-theme-switcher"
      label={t('common.theme')}
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
