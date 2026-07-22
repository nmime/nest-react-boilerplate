import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { observer } from 'mobx-react-lite';
import { afterEach, describe, expect, it } from 'vitest';
import { FrontendI18nProvider, useI18n } from '../i18n/i18n-provider';
import { AppStore, FrontendStateProvider, createRootStore, useRootStore, useStore } from './index';

const LocalePreview = observer(function LocalePreview() {
  const { locale, setLocale } = useI18n();
  const { ui } = useRootStore();
  const appStore = useStore(AppStore);

  return (
    <div>
      <span>{locale}</span>
      <span>{appStore.currentBreakpoint}</span>
      <button
        onClick={() => {
          setLocale('ru');
        }}
        type="button"
      >
        switch locale
      </button>
      <button
        onClick={() => {
          ui.toggleSidebar();
        }}
        type="button"
      >
        {ui.sidebarOpen ? 'open' : 'closed'}
      </button>
    </div>
  );
});

describe('frontend MobX state foundation', () => {
  afterEach(() => {
    cleanup();
    document.cookie = 'locale=; path=/; max-age=0';
  });

  it('drives i18n locale from the shared LocaleStore', () => {
    const store = createRootStore({ initialLocale: 'en' });
    render(
      <FrontendStateProvider store={store}>
        <FrontendI18nProvider>
          <LocalePreview />
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );

    expect(screen.getByText('en')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'switch locale' }));

    expect(screen.getByText('ru')).toBeTruthy();
    expect(document.documentElement.lang).toBe('ru');
  });

  it('keeps client-only shell state in MobX without server cache data', () => {
    const store = createRootStore({ initialTheme: 'dark' });
    store.authShell.markAuthenticated();
    store.ui.openModal('profile-menu');
    store.ui.toggleSidebar();

    expect(store.authShell.isAuthenticated).toBe(true);
    expect(store.authShell.sessionStatus).toBe('authenticated');
    expect(store.ui.activeModal).toBe('profile-menu');
    expect(store.ui.sidebarOpen).toBe(false);
    expect(store.ui.theme).toBe('dark');
    expect(store.app.breakpoints.gte('mobile')).toBe(true);
  });
});
