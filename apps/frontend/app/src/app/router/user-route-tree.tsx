import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { NotFoundPage } from '../../pages/not-found';
import { UserRoot } from './user-root';
import { UserShell } from './user-shell';
import { userRoutesWithChrome, type UserRouteDescriptor } from './user-route-registry';
import { userRoutes } from './user-routes';

/**
 * Builds the router tree from a route registry. Chrome is a property of each
 * descriptor: `shell` routes hang off a pathless layout route rendering
 * {@link UserShell}, `none` routes hang off the root so they render bare. The
 * root itself carries only cross-cutting behaviour, never product chrome.
 */
const createUserRouteTree = (routes: readonly UserRouteDescriptor[]) => {
  const rootRoute = createRootRoute({
    component: UserRoot,
    notFoundComponent: () => (
      <UserShell routes={routes}>
        <NotFoundPage />
      </UserShell>
    ),
  });

  const shellRoute = createRoute({
    component: () => <UserShell routes={routes} />,
    getParentRoute: () => rootRoute,
    id: 'shell',
  });

  const framedRoutes = userRoutesWithChrome(routes, 'shell').map(({ component, path }) =>
    createRoute({ component, getParentRoute: () => shellRoute, path }),
  );
  const bareRoutes = userRoutesWithChrome(routes, 'none').map(({ component, path }) =>
    createRoute({ component, getParentRoute: () => rootRoute, path }),
  );

  return rootRoute.addChildren([shellRoute.addChildren(framedRoutes), ...bareRoutes]);
};

export const createUserRouter = (
  history: RouterHistory = createBrowserHistory(),
  routes: readonly UserRouteDescriptor[] = userRoutes,
) =>
  createRouter({
    routeTree: createUserRouteTree(routes),
    history,
    trailingSlash: 'never',
    defaultPreload: false,
  });

export type UserRouter = ReturnType<typeof createUserRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: UserRouter;
  }
}
