// @requirements REQ-FRONTEND-NATIVE-006
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Layout from './app/_layout';

vi.mock('react-native-gesture-handler', () => ({}));

vi.mock('@app/frontend-ui-native', async () => {
  // Mock only the Tamagui React wrappers; use the REAL shared design tokens so
  // native tests track the single source instead of encoding stale values.
  const { designColors, designRadii, designSpacing } = await import('@app/common-design-tokens');
  return {
    TamaguiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Theme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    nativeTamaguiConfig: {},
    designColors,
    designRadii,
    designSpacing,
  };
});

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

  it('renders the root layout structure', () => {
    const view = render(<Layout />);

    expect(view.container).toBeTruthy();
  });
});
