import { useCallback, type ReactNode } from 'react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { observer, useI18n } from '@app/frontend-runtime';
import { resolveAppProductBrand } from '../../shared/config';
import { MiniAppShell } from '../../shared/ui';
import { normalizePath, useUserNavigate } from './user-navigation';
import { activeUserNavPath, userNavRoutes, type UserRouteDescriptor } from './user-route-registry';
import { userRoutes } from './user-routes';

export interface UserShellProps {
  children?: ReactNode;
  routes?: readonly UserRouteDescriptor[];
}

/**
 * Layout route for routes that opt into app chrome (`MiniAppShell` nav + Back
 * control) with the matched route in `<Outlet/>`. Routes declaring
 * `chrome: 'none'` are mounted beside this layout and never reach it.
 *
 * The navigation is derived from the route registry, so a page cannot exist
 * without the shell knowing which nav entry owns it.
 */
export const UserShell = observer(function UserShell({ children, routes = userRoutes }: Readonly<UserShellProps>) {
  const { t } = useI18n();
  const router = useRouter();
  const navigate = useUserNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const route = normalizePath(pathname);
  const activeNavPath = activeUserNavPath(routes, route);
  const brand = resolveAppProductBrand();
  const onBack = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    navigate('/', { replace: true });
  }, [navigate, router]);

  const actions = userNavRoutes(routes).map(({ nav, path }) => ({
    href: path,
    isCurrent: activeNavPath === path,
    label: t(nav.label),
    ...(nav.variant ? { variant: nav.variant } : {}),
  }));

  return (
    <MiniAppShell
      activePath={route}
      actions={actions}
      appName={brand.name}
      description={t('user.description')}
      eyebrow={t('user.eyebrow')}
      heroActions={[]}
      onBack={onBack}
      shareText={t('user.description')}
      shareTitle={brand.name}
      title={t('user.title')}
    >
      {children ?? <Outlet />}
    </MiniAppShell>
  );
});
