import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('renders the app title', async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    render(<MobileHomeScreen />);

    expect(screen.getByText('Nest React Mobile')).toBeTruthy();
  });

  it('renders the runtime status badge', async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    render(<MobileHomeScreen />);

    expect(screen.getByText('Ready for release')).toBeTruthy();
  });

  it('renders three capability cards', async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    render(<MobileHomeScreen />);

    expect(screen.getByText('Expo Router')).toBeTruthy();
    expect(screen.getByText('Shared tokens')).toBeTruthy();
    expect(screen.getByText('Nx + export')).toBeTruthy();
  });

  it('renders the configured API endpoint panel', async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    render(<MobileHomeScreen />);

    expect(screen.getByText('API target')).toBeTruthy();
    expect(screen.getByText('Configured endpoint')).toBeTruthy();
  });

  it('renders a primary action button', async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    render(<MobileHomeScreen />);

    const button = screen.getByRole('button', { name: 'Open configured API' });
    expect(button).toBeTruthy();
  });
});
