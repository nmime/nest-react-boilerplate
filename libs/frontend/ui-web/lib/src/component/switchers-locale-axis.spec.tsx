// @requirements REQ-FRONTEND-ACCESSIBILITY-003
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontendI18nProvider } from '@app/frontend-runtime';
import { LanguageSwitcher } from './switchers';

// The switcher has to label a locale the catalogs never name, so the axis is widened here instead of
// in `supportedLocales`: this spec is about the derivation, not about which locales the repo ships.
const { declaredLocales } = vi.hoisted(() => ({ declaredLocales: ['en', 'ru', 'uz-cyrl', 'zz'] }));

vi.mock('@app/frontend-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/frontend-runtime')>()),
  supportedLocales: declaredLocales,
}));

function optionLabels(): string[] {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });

  fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Language' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });

  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((option) => option.textContent);
}

describe('frontend UI-web language switcher labels', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('derives a label for a locale no catalog names, and prefers a catalog entry where one exists', () => {
    render(
      <FrontendI18nProvider initialLocale="en">
        <LanguageSwitcher />
      </FrontendI18nProvider>,
    );

    const labels = optionLabels();

    expect(labels).toContain('Uzbek (Cyrillic)');
    expect(labels).not.toContain('common.language.uz-cyrl');
    expect(labels).toContain('Russian');
  });

  it('falls back to canonical BCP 47 casing when the runtime has no display name', () => {
    render(
      <FrontendI18nProvider initialLocale="en">
        <LanguageSwitcher />
      </FrontendI18nProvider>,
    );

    expect(optionLabels()).toContain('zz');
  });
});
