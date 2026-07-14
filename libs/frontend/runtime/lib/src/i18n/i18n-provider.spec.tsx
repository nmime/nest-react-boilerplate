import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedFrontendTranslations, type FrontendTranslations } from './locale';
import { detectBrowserLocale } from '../state';
import { FrontendI18nProvider, useI18n } from './i18n-provider';

const testTranslations = {
  en: {
    ...sharedFrontendTranslations.en,
    'landing.title': 'Launch a production-ready full-stack foundation',
  },
  ru: {
    ...sharedFrontendTranslations.ru,
    'landing.title': 'Запустите готовую full-stack основу',
  },
} satisfies FrontendTranslations;

function Example() {
  const { t } = useI18n();
  return <p>{t('landing.title')}</p>;
}

function LocaleAction() {
  const { setLocale, t } = useI18n();
  return (
    <button
      onClick={() => {
        setLocale('ru');
      }}
      type="button"
    >
      {t('common.language')}
    </button>
  );
}

function ThemeAction() {
  const { setTheme, t } = useI18n();
  return (
    <button
      onClick={() => {
        setTheme('dark');
      }}
      type="button"
    >
      {t('common.theme')}
    </button>
  );
}

function installStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    },
  });
}

describe('FrontendI18nProvider', () => {
  afterEach(() => {
    cleanup();
    document.cookie = 'locale=; path=/; max-age=0';
    document.cookie = 'lang=; path=/; max-age=0';
  });

  it('renders translated content from provider locale', () => {
    const html = renderToStaticMarkup(
      <FrontendI18nProvider initialLocale="ru" translations={testTranslations}>
        <Example />
      </FrontendI18nProvider>,
    );

    expect(html).toContain('Запустите готовую full-stack основу');
  });

  it('prefers an authenticated user locale over stored fallback values', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => 'en'),
        setItem: vi.fn(),
      },
    });

    render(
      <FrontendI18nProvider translations={testTranslations} userLocale="ru">
        <Example />
      </FrontendI18nProvider>,
    );

    expect(screen.getByText(/Запустите готовую full-stack основу/u)).toBeTruthy();
  });

  it('persists explicit language switches through the callback and local storage', () => {
    const setItem = vi.fn();
    const onLocaleChange = vi.fn();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem,
      },
    });

    render(
      <FrontendI18nProvider initialLocale="en" onLocaleChange={onLocaleChange}>
        <LocaleAction />
      </FrontendI18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Language' }));

    expect(onLocaleChange).toHaveBeenCalledWith('ru');
    expect(setItem).toHaveBeenCalledWith('boilerplate.locale', 'ru');
    expect(document.documentElement.lang).toBe('ru');
    expect(screen.getByText('Язык')).toBeTruthy();
  });

  it('persists explicit theme switches through callback and local storage', () => {
    const setItem = vi.fn();
    const onThemeChange = vi.fn();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => null),
        setItem,
      },
    });

    render(
      <FrontendI18nProvider initialTheme="system" onThemeChange={onThemeChange}>
        <ThemeAction />
      </FrontendI18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));

    expect(onThemeChange).toHaveBeenCalledWith('dark');
    expect(setItem).toHaveBeenCalledWith('boilerplate.theme', 'dark');
    expect(document.documentElement.dataset['themePreference']).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('detects query locale before browser fallback', () => {
    installStorage();
    window.history.replaceState(null, '', '/?lang=ru');
    expect(detectBrowserLocale()).toBe('ru');
  });
});
