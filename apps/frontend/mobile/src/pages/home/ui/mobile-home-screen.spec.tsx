// @requirements REQ-FRONTEND-NATIVE-006
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { MobileRuntimeProvider } from '../../../shared';
import { mobileLocaleOptions } from '../model/mobile-home.model';

vi.mock('@app/frontend-ui-native', async () => {
  // Mock only the Tamagui React wrappers; use the REAL shared design tokens so
  // native tests track the single source instead of encoding stale values.
  const { designColors, designRadii, designSpacing } = await import('@app/common-design-tokens');
  return {
    TamaguiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Theme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    designColors,
    designRadii,
    designSpacing,
  };
});

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const applyUserLocale = vi.fn();
const persistUserLocale = vi.fn(() => Promise.resolve());

describe('mobile home screen', () => {
  const renderScreen = async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    return render(
      <FrontendStateProvider>
        <FrontendI18nProvider translations={userFrontendTranslations}>
          <MobileRuntimeProvider value={{ applyUserLocale, persistUserLocale, userLocale: 'en' }}>
            <MobileHomeScreen />
          </MobileRuntimeProvider>
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );
  };

  beforeEach(() => {
    applyUserLocale.mockClear();
    persistUserLocale.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the app title', async () => {
    await renderScreen();

    expect(screen.getByRole('heading', { name: 'Nest React Boilerplate' })).toBeTruthy();
  });

  it('renders the neutral mobile account eyebrow', async () => {
    await renderScreen();

    expect(screen.getByText('Mobile account')).toBeTruthy();
  });

  it('renders three capability cards', async () => {
    await renderScreen();

    expect(screen.getByText('Profile and preferences')).toBeTruthy();
    expect(screen.getByText('Designed for mobile')).toBeTruthy();
    expect(screen.getByText('Web and Telegram')).toBeTruthy();
  });

  it('renders a product-neutral account panel', async () => {
    await renderScreen();

    expect(screen.getByText('Your space')).toBeTruthy();
    expect(screen.getByText('Account essentials stay close at hand.')).toBeTruthy();
  });

  it('switches locale through the shared preference model', async () => {
    await renderScreen();

    // Read the label back off the model instead of restating it: the switcher renders whatever
    // label the shared helper derives, and this assertion must not turn into a locale enumeration.
    const russian = mobileLocaleOptions.find((option) => option.locale === 'ru');
    fireEvent.click(screen.getByText(russian?.label ?? 'ru'));

    expect(applyUserLocale).toHaveBeenCalledWith('ru');
    expect(persistUserLocale).toHaveBeenCalledWith('ru');
  });
});
