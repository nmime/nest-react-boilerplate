// @requirements REQ-FRONTEND-SHELL-004
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../entities/admin-session';
import type { AdminRouteDescriptor } from '../shared';
import { adminRoutePages, renderAdminRoute } from './router/admin-route-matrix';
import { adminRouterPaths } from './router/admin-route-tree';
import {
  adminNavigationItems,
  adminRouteDescriptors,
  adminRouteHref,
  fallbackTranslate,
  findAdminRoute,
} from '../shared';

const renderMarkup = (element: ReactElement): string =>
  renderToStaticMarkup(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>{element}</FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const accessFor = (permissions: readonly string[]) =>
  createAdminAccess({ permissions: [...permissions], roles: ['admin'], subject: 'admin-id' });

const flattenNav = (items: readonly { children?: readonly unknown[]; href?: string }[]): string[] =>
  items.flatMap((item) => [
    ...(item.href === undefined ? [] : [item.href]),
    ...flattenNav((item.children ?? []) as readonly { children?: readonly unknown[]; href?: string }[]),
  ]);

describe('admin route registry', () => {
  it('is the single source of the router path list', () => {
    expect([...adminRouterPaths].sort((left, right) => left.localeCompare(right))).toEqual(
      [...adminRouteDescriptors.flatMap((route) => route.paths)].sort((left, right) => left.localeCompare(right)),
    );
  });

  it('renders every descriptor through a page, so no route can be registered without one', () => {
    // Each factory is invoked, not just looked up: a descriptor whose page factory reads a context
    // field the router never supplies would still type-check and still pass a presence check.
    const context = {
      access: accessFor(['admin:manage:all']),
      currentPath: '/admin',
      payload: { principal: { subject: 'admin-id' }, profile: { id: 'admin-id' } },
    };

    for (const route of adminRouteDescriptors) {
      expect(adminRoutePages[route.id]).toBeTypeOf('function');
      expect(adminRoutePages[route.id](context).type).toBeTypeOf('function');
    }
  });

  it('resolves every declared path back to its own descriptor', () => {
    for (const route of adminRouteDescriptors) {
      for (const path of route.paths) {
        // `$param` segments stand in for a concrete value in the router.
        const concrete = path.replaceAll(/\$[^/]*/gu, 'value');
        expect(findAdminRoute(concrete)?.id).toBe(route.id);
      }
    }
  });

  it('shows a navigation entry exactly when the route matrix would let the page render', () => {
    const noAccess = accessFor([]);
    const fullAccess = accessFor(['admin:manage:all']);

    for (const access of [noAccess, fullAccess]) {
      const hrefs = flattenNav(adminNavigationItems({ access, path: '/', t: fallbackTranslate }));

      // Read through the declared interface rather than the `as const` literal: every route
      // happens to carry a nav entry today, which would make the filter below look dead, and the
      // first route added without one is exactly the case this loop must keep skipping.
      const navigable: readonly AdminRouteDescriptor[] = adminRouteDescriptors;

      for (const route of navigable.filter((candidate) => candidate.nav)) {
        const allowed = route.access(access);
        expect(hrefs.includes(adminRouteHref(route))).toBe(allowed);
        if (allowed) {
          continue;
        }
        // A hidden nav entry must also be an unreachable page, never a link the
        // sidebar omits while the matrix still renders it.
        const markup = renderMarkup(
          renderAdminRoute(route.paths[0], { access, payload: { principal: {} }, status: 'ready' }),
        );
        expect(markup).toContain('Access denied');
      }
    }
  });
});
