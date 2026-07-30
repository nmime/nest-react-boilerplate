import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { useI18n } from '@app/frontend-runtime';
import { NotFoundPage } from '../../pages/not-found';
import { adminBasepath, useAdminCurrentPath } from './admin-navigation';
import { AdminShell } from './admin-shell';
import { renderAdminRoute } from './admin-route-matrix';
import { useAdminRuntime } from './admin-runtime-context';

const rootRoute = createRootRoute({
  component: AdminShell,
  notFoundComponent: () => <NotFoundPage />,
});

/**
 * Shared component for every admin route node. The shell only renders
 * `<Outlet/>` once the session is ready, so page selection + RBAC guard is
 * delegated to the single tested {@link renderAdminRoute} matrix keyed on the
 * active URL.
 */
function AdminRouteComponent() {
  const { t } = useI18n();
  const { state, requestOptions } = useAdminRuntime();
  const currentPath = useAdminCurrentPath();
  return renderAdminRoute(currentPath, state, t, { requestOptions });
}

// Explicit per-path nodes so the router matches known routes (and delivers a
// real notFound for everything else); the RBAC matrix decides the page.
const paths = [
  '/',
  '/dashboard',
  '/users',
  '/users/$userId',
  '/roles',
  '/audit',
  '/audit/$',
  '/auth/login-analytics',
  '/profile',
  '/settings/errors',
  '/settings/feature-flags',
  '/notifications/templates',
  '/notifications/segments',
  '/notifications/broadcasts',
];

const routeTree = rootRoute.addChildren(
  paths.map((path) => createRoute({ getParentRoute: () => rootRoute, path, component: AdminRouteComponent })),
);

export const createAdminRouter = (history: RouterHistory = createBrowserHistory()) =>
  createRouter({
    routeTree,
    history,
    basepath: adminBasepath,
    trailingSlash: 'never',
    defaultPreload: false,
  });

export type AdminRouter = ReturnType<typeof createAdminRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AdminRouter;
  }
}
