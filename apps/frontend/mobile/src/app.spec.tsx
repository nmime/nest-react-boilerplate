import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native-gesture-handler', () => ({}));

vi.mock('@app/frontend-ui-native', () => ({
  TamaguiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Theme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  nativeTamaguiConfig: {},
  designColors: { light: { primary: '#0f172a' } },
  designRadii: { sm: 4, md: 8 },
  designSpacing: { 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('expo-router', () => ({
  Stack: () => null,
}));

describe('mobile app layout', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('renders the root layout structure', async () => {
    const Layout = (await import('./app/_layout')).default;
    const view = render(<Layout />);

    expect(view.container).toBeTruthy();
  });
});
