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

    expect(screen.getByText('Nest React Mobile')).toBeTruthy();
  });

  it('renders the runtime status badge', async () => {
    await renderScreen();

    expect(screen.getByText('Scaffold ready')).toBeTruthy();
  });

  it('renders three capability cards', async () => {
    await renderScreen();

    expect(screen.getByText('Expo Router')).toBeTruthy();
    expect(screen.getByText('Shared tokens')).toBeTruthy();
    expect(screen.getByText('Nx and export')).toBeTruthy();
  });

  it('renders the configured API endpoint panel', async () => {
    await renderScreen();

    expect(screen.getByText('API target')).toBeTruthy();
    expect(screen.getByText('Configured endpoint')).toBeTruthy();
  });

  it('renders a primary action button', async () => {
    await renderScreen();

    const button = screen.getByRole('button', { name: 'Open configured API' });
    expect(button).toBeTruthy();
  });
});
