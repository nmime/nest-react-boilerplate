import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { AuthPage } from '../../pages/auth';
import { AuthDiscordCallbackPage } from '../../pages/auth-discord-callback';
import { AuthTelegramCallbackPage } from '../../pages/auth-telegram-callback';
import { ProfilePage } from '../../pages/profile';
import { SettingsPage } from '../../pages/settings';
import { TmaPage } from '../../pages/tma';
import { UserHomePage } from '../../pages/user-home';

export interface UserRouterProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

type NavigateOptions = { replace?: boolean };
const appNavigationStateKey = 'userAppNavigation';

const isAppNavigationState = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && (state as Record<string, unknown>)[appNavigationStateKey] === true;

const getPathname = () => globalThis.location.pathname;
const subscribeToNavigation = (listener: () => void) => {
  globalThis.addEventListener('popstate', listener);
  return () => {
    globalThis.removeEventListener('popstate', listener);
  };
};

const normalizePath = (path: string): string => {
  /* v8 ignore next -- browser location.pathname is never blank; fallback keeps the helper total for server snapshots. */
  const normalized = path.trim() || '/';
  return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
};

const getLinkRoute = (path: string): '/link/telegram' | '/link/discord' | null => {
  const normalized = normalizePath(path);
  if (normalized === '/link/telegram' || normalized === '/link/discord') {
    return normalized;
  }
  return null;
};

export function UserRouter({ applyUserLocale, applyUserTheme }: Readonly<UserRouterProps>) {
  const { t } = useI18n();
  const pathname = useSyncExternalStore(subscribeToNavigation, getPathname, () => '/');
  const route = normalizePath(pathname);
  const linkRoute = getLinkRoute(route);
  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    const nextUrl = new URL(to, globalThis.location.origin);
    if (options.replace) {
      globalThis.history.replaceState({ [appNavigationStateKey]: true }, '', nextUrl.pathname + nextUrl.search);
    } else {
      globalThis.history.pushState({ [appNavigationStateKey]: true }, '', nextUrl.pathname + nextUrl.search);
    }
    globalThis.dispatchEvent(new Event('popstate'));
  }, []);
  const handleBack = useCallback(() => {
    const historyState: unknown = globalThis.history.state;
    if (isAppNavigationState(historyState)) {
      globalThis.history.back();
      return;
    }
    navigate('/', { replace: true });
  }, [navigate]);
  const navActions = useMemo(
    () => [
      { href: '/', isCurrent: route === '/', label: t('user.nav.home') },
      {
        href: '/profile',
        isCurrent:
          route === '/profile' ||
          route === '/auth' ||
          route === '/auth/discord/callback' ||
          route === '/auth/telegram/callback',
        label: t('user.nav.profile'),
        variant: 'secondary' as const,
      },
      {
        href: '/settings',
        isCurrent: route === '/settings' || linkRoute === '/link/discord',
        label: t('user.nav.settings'),
        variant: 'secondary' as const,
      },
      {
        href: '/tma',
        isCurrent:
          route === '/tma' || route === '/tma/auth' || route === '/telegram-mini-app' || linkRoute === '/link/telegram',
        label: 'Telegram',
        variant: 'secondary' as const,
      },
    ],
    [linkRoute, route, t],
  );
  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      // Let the browser handle anything that is not a plain left click, or a
      // click the app already handled, so new-tab/download/modified clicks work.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const anchorTarget = anchor.getAttribute('target');
      if ((anchorTarget && anchorTarget !== '_self') || anchor.hasAttribute('download')) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href?.startsWith('/')) {
        return;
      }
      event.preventDefault();
      navigate(href);
    };
    globalThis.document.addEventListener('click', clickHandler);
    return () => {
      globalThis.document.removeEventListener('click', clickHandler);
    };
  }, [navigate]);

  const renderRoute = () => {
    if (route === '/auth/discord/callback') {
      return <AuthDiscordCallbackPage navigate={navigate} />;
    }

    if (route === '/auth/telegram/callback') {
      return <AuthTelegramCallbackPage navigate={navigate} />;
    }

    if (route === '/auth') {
      return <AuthPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
    }

    if (route === '/profile') {
      return <ProfilePage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} />;
    }

    if (route === '/settings') {
      return <SettingsPage navigate={navigate} />;
    }

    if (route === '/tma' || route === '/tma/auth' || route === '/telegram-mini-app') {
      return <TmaPage navigate={navigate} />;
    }

    if (linkRoute === '/link/telegram') {
      return <TmaPage fallbackStartParam="link_telegram" navigate={navigate} />;
    }

    if (linkRoute === '/link/discord') {
      return <SettingsPage navigate={navigate} />;
    }

    return <UserHomePage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} />;
  };

  if (route === '/') {
    return (
      <UserHomePage
        activeRoute="/"
        actions={navActions}
        applyUserLocale={applyUserLocale}
        applyUserTheme={applyUserTheme}
        onBack={handleBack}
      />
    );
  }

  return (
    <UserHomePage
      activeRoute={linkRoute ?? route}
      actions={navActions}
      applyUserLocale={applyUserLocale}
      applyUserTheme={applyUserTheme}
      onBack={handleBack}
    >
      {renderRoute()}
    </UserHomePage>
  );
}
