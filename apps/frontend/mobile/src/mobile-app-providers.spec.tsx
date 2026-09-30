// @requirements REQ-FRONTEND-NATIVE-006
// Evidence for: REQ-FRONTEND-NATIVE-006
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '@app/frontend-runtime';
import { MobileAppProviders } from './app/mobile-app-providers';
import { useMobileRuntime } from './shared';

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-native')>()),
  Platform: { OS: 'android' },
}));

function LocaleProbe() {
  const { locale } = useI18n();
  const { applyUserLocale } = useMobileRuntime();

  return (
    <>
      <span data-testid="locale">{locale}</span>
      <button
        onClick={() => {
          applyUserLocale('ru');
        }}
        type="button"
      >
        to-russian
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = 'locale=; path=/; max-age=0';
  document.cookie = 'lang=; path=/; max-age=0';
  vi.unstubAllEnvs();
});

describe('MobileAppProviders', () => {
  it('does not send preference writes from an unconfigured native shell', async () => {
    for (const name of [
      'EXPO_PUBLIC_API_BASE_URL',
      'EXPO_PUBLIC_ADMIN_API_URL',
      'EXPO_PUBLIC_AUTH_API_URL',
      'EXPO_PUBLIC_USER_API_URL',
    ])
      vi.stubEnv(name, '');
    const transport = vi.fn<typeof fetch>();
    function PersistProbe() {
      const { persistUserLocale, userLocale } = useMobileRuntime();
      return (
        <button
          onClick={() => {
            void persistUserLocale('ru');
          }}
        >
          {userLocale ?? 'persist'}
        </button>
      );
    }
    render(
      <MobileAppProviders sessionFetch={transport}>
        <PersistProbe />
      </MobileAppProviders>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'persist' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ru' })).toBeTruthy());
    expect(transport).not.toHaveBeenCalled();
  });

  it('drives the shared preference model so a locale change flows into i18n', async () => {
    render(
      <MobileAppProviders>
        <LocaleProbe />
      </MobileAppProviders>,
    );

    expect(screen.getByTestId('locale').textContent).toBe('en');

    fireEvent.click(screen.getByText('to-russian'));

    await waitFor(() => {
      expect(screen.getByTestId('locale').textContent).toBe('ru');
    });
  });
});
