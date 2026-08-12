// @requirements REQ-FRONTEND-SHELL-004
import { describe, expect, it } from 'vitest';
import {
  activeUserNavPath,
  defineUserRoutes,
  matchUserRoute,
  userNavRoutes,
  userRoutesWithChrome,
  type UserRouteDescriptor,
} from './user-route-registry';

const Stub = () => null;

const descriptor = (overrides: Partial<UserRouteDescriptor> & { path: string }): UserRouteDescriptor => ({
  component: Stub,
  ...overrides,
});

describe('user route registry', () => {
  it('keeps declaration order and defaults every route to shell chrome', () => {
    const routes = defineUserRoutes([descriptor({ path: '/' }), descriptor({ chrome: 'none', path: '/embed' })]);

    expect(routes.map((route) => route.path)).toEqual(['/', '/embed']);
    expect(userRoutesWithChrome(routes, 'shell').map((route) => route.path)).toEqual(['/']);
    expect(userRoutesWithChrome(routes, 'none').map((route) => route.path)).toEqual(['/embed']);
  });

  it('rejects a duplicated path so two pages cannot claim one URL', () => {
    expect(() => defineUserRoutes([descriptor({ path: '/profile' }), descriptor({ path: '/profile' })])).toThrow(
      /duplicate user route path: \/profile/iu,
    );
  });

  it('derives navigation from the routes, ordered by the declared nav order', () => {
    const routes = defineUserRoutes([
      descriptor({ nav: { label: 'user.nav.settings', order: 2 }, path: '/settings' }),
      descriptor({ nav: { label: 'user.nav.home', order: 1 }, path: '/' }),
      descriptor({ path: '/auth' }),
    ]);

    expect(userNavRoutes(routes).map((route) => route.nav.label)).toEqual(['user.nav.home', 'user.nav.settings']);
  });

  it('rejects two navigation entries claiming the same slot', () => {
    expect(() =>
      defineUserRoutes([
        descriptor({ nav: { label: 'user.nav.home', order: 1 }, path: '/' }),
        descriptor({ nav: { label: 'user.nav.profile', order: 1 }, path: '/profile' }),
      ]),
    ).toThrow(/duplicate user nav order: 1/iu);
  });

  it('rejects a navParent that owns no navigation entry, so aliases cannot drift', () => {
    expect(() =>
      defineUserRoutes([descriptor({ path: '/auth' }), descriptor({ navParent: '/auth', path: '/auth/callback' })]),
    ).toThrow(/navParent "\/auth"/u);
  });

  it('rejects a route that is both a navigation entry and an alias of another', () => {
    expect(() =>
      defineUserRoutes([
        descriptor({ nav: { label: 'user.nav.profile', order: 1 }, path: '/profile' }),
        descriptor({ nav: { label: 'user.nav.home', order: 2 }, navParent: '/profile', path: '/' }),
      ]),
    ).toThrow(/both a navigation entry and an alias/iu);
  });

  it('resolves the highlighted nav entry for a route, its aliases and unknown paths', () => {
    const routes = defineUserRoutes([
      descriptor({ nav: { label: 'user.nav.profile', order: 1 }, path: '/profile' }),
      descriptor({ navParent: '/profile', path: '/auth' }),
      descriptor({ navParent: '/profile', path: '/auth/discord/callback' }),
    ]);

    expect(activeUserNavPath(routes, '/profile')).toBe('/profile');
    expect(activeUserNavPath(routes, '/auth')).toBe('/profile');
    expect(activeUserNavPath(routes, '/auth/discord/callback/')).toBe('/profile');
    expect(activeUserNavPath(routes, '/unknown')).toBeUndefined();
  });

  it('resolves an identifier-bearing URL to the descriptor that declares the parameter', () => {
    const routes = defineUserRoutes([
      descriptor({ nav: { label: 'user.nav.home', order: 1 }, path: '/items' }),
      descriptor({ navParent: '/items', path: '/items/$itemId' }),
      descriptor({ navParent: '/items', path: '/items/new' }),
    ]);

    expect(matchUserRoute(routes, '/items/abc')?.path).toBe('/items/$itemId');
    expect(activeUserNavPath(routes, '/items/abc')).toBe('/items');
    // A parameter owns exactly one segment, so neither a deeper URL nor a blank
    // segment may fall into it.
    expect(matchUserRoute(routes, '/items/abc/extra')).toBeUndefined();
    expect(activeUserNavPath(routes, '/items/abc/extra')).toBeUndefined();
    expect(matchUserRoute(routes, '/items//')).toBeUndefined();
  });

  it('prefers a static route over a parameterised one claiming the same URL', () => {
    const routes = defineUserRoutes([
      descriptor({ nav: { label: 'user.nav.home', order: 1 }, path: '/items' }),
      descriptor({ navParent: '/items', path: '/items/$itemId' }),
      descriptor({ navParent: '/items', path: '/items/new' }),
    ]);

    expect(matchUserRoute(routes, '/items/new')?.path).toBe('/items/new');
  });
});
