import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';

vi.mock('@app/frontend-ui-native', () => ({
  TamaguiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Theme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  designColors: {
    light: {
      primary: '#0f172a',
      primaryForeground: '#ffffff',
      foreground: '#0f172a',
      mutedForeground: '#64748b',
      card: '#ffffff',
      cardForeground: '#0f172a',
      border: '#e2e8f0',
    },
  },
  designRadii: { sm: 4, md: 8 },
  designSpacing: { 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('mobile home screen', () => {
  const renderScreen = async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    return render(
      <FrontendStateProvider>
        <FrontendI18nProvider translations={userFrontendTranslations}>
          <MobileHomeScreen />
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );
  };

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
});
