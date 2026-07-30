import { useCallback, useEffect } from 'react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { observer, useI18n } from '@app/frontend-runtime';
import { MiniAppShell } from '../../shared/ui';
import { getLinkRoute, normalizePath, useUserNavigate } from './user-navigation';

/**
 * Layout route rendered for every user route: the persistent chrome
 * (`MiniAppShell` nav + Back control) with the matched route in `<Outlet/>`.
 * Also delegates in-app anchor clicks to the router so they route client-side.
 */
export const UserShell = observer(function UserShell() {
  const { t } = useI18n();
  const router = useRouter();
  const navigate = useUserNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const route = normalizePath(pathname);
  const linkRoute = getLinkRoute(route);
  const onBack = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    navigate('/', { replace: true });
  }, [navigate, router]);

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

  const actions = [
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
      label: t('auth.provider.telegram'),
      variant: 'secondary' as const,
    },
  ];

  return (
    <MiniAppShell
      activePath={linkRoute ?? route}
      actions={actions}
      appName={t('user.appName')}
      description={t('user.description')}
      eyebrow={t('user.eyebrow')}
      heroActions={[]}
      onBack={onBack}
      shareText={t('user.description')}
      shareTitle={t('user.appName')}
      title={t('user.title')}
    >
      <Outlet />
    </MiniAppShell>
  );
});
