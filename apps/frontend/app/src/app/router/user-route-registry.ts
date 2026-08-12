import type { FunctionComponent } from 'react';
import type { TranslationKey } from '@app/frontend-runtime';
import { normalizePath } from './user-navigation';

/** `shell` wraps the route in `UserShell`; `none` opts a route out of app chrome. */
export type UserRouteChrome = 'shell' | 'none';

export interface UserRouteNavEntry {
  readonly label: TranslationKey;
  readonly order: number;
  readonly variant?: 'secondary';
}

export interface UserRouteDescriptor {
  readonly path: string;
  readonly component: FunctionComponent;
  /** Defaults to `shell`. */
  readonly chrome?: UserRouteChrome;
  /** Declares this route as a navigation destination. */
  readonly nav?: UserRouteNavEntry;
  /**
   * Path of the navigation destination this route belongs to (aliases, OAuth
   * callbacks, deep links). Keeps the highlighted nav entry a property of the
   * route rather than a path list maintained beside it.
   */
  readonly navParent?: string;
}

export interface UserNavRouteDescriptor extends UserRouteDescriptor {
  readonly nav: UserRouteNavEntry;
}

const hasNav = (route: UserRouteDescriptor): route is UserNavRouteDescriptor => route.nav !== undefined;

const assertUniquePaths = (routes: readonly UserRouteDescriptor[]): void => {
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route.path)) {
      throw new Error(`Duplicate user route path: ${route.path}`);
    }
    seen.add(route.path);
  }
};

const assertUniqueNavOrder = (routes: readonly UserRouteDescriptor[]): void => {
  const seen = new Set<number>();
  for (const route of routes.filter(hasNav)) {
    if (seen.has(route.nav.order)) {
      throw new Error(`Duplicate user nav order: ${route.nav.order} (${route.path})`);
    }
    seen.add(route.nav.order);
  }
};

const assertNavParentsResolve = (routes: readonly UserRouteDescriptor[]): void => {
  const navPaths = new Set(routes.filter(hasNav).map((route) => route.path));
  for (const route of routes) {
    if (route.navParent === undefined) {
      continue;
    }
    if (hasNav(route)) {
      throw new Error(`Route ${route.path} is both a navigation entry and an alias of ${route.navParent}.`);
    }
    if (!navPaths.has(route.navParent)) {
      throw new Error(`Route ${route.path} declares navParent "${route.navParent}", which owns no navigation entry.`);
    }
  }
};

/**
 * Single registration point for the user app's pages. Adding a page means adding
 * one descriptor here: the route tree, the shell chrome decision and the bottom
 * navigation are all derived from this list, so they cannot disagree.
 */
export const defineUserRoutes = (routes: readonly UserRouteDescriptor[]): readonly UserRouteDescriptor[] => {
  assertUniquePaths(routes);
  assertUniqueNavOrder(routes);
  assertNavParentsResolve(routes);
  return Object.freeze([...routes]);
};

export const userRoutesWithChrome = (
  routes: readonly UserRouteDescriptor[],
  chrome: UserRouteChrome,
): readonly UserRouteDescriptor[] => routes.filter((route) => (route.chrome ?? 'shell') === chrome);

export const userNavRoutes = (routes: readonly UserRouteDescriptor[]): readonly UserNavRouteDescriptor[] =>
  [...routes.filter(hasNav)].sort((left, right) => left.nav.order - right.nav.order);

/**
 * Segment-wise specificity of `routePath` against an already split URL, or
 * `undefined` when the descriptor does not own it. A static segment scores
 * above a `$param` one so `/items/new` wins over `/items/$itemId`.
 */
const routeMatchScore = (routePath: string, segments: readonly string[]): number | undefined => {
  const pattern = routePath.split('/');
  if (pattern.length !== segments.length) {
    return undefined;
  }
  let score = 0;
  for (const [index, expected] of pattern.entries()) {
    /* v8 ignore next -- the segment counts are equal by the guard above; the fallback keeps the index total. */
    const actual = segments[index] ?? '';
    if (expected.startsWith('$')) {
      if (actual === '') {
        return undefined;
      }
      score += 1;
      continue;
    }
    if (expected !== actual) {
      return undefined;
    }
    score += 2;
  }
  return score;
};

/**
 * Descriptor owning a live URL, or `undefined` for unknown ones. A `$param`
 * segment matches exactly one non-empty URL segment, the way the route tree
 * mounts it, so consumers that must map a URL back to a page — shell chrome,
 * auth policies, telemetry — ask the registry instead of keeping a second
 * matcher beside it.
 */
export const matchUserRoute = (
  routes: readonly UserRouteDescriptor[],
  path: string,
): UserRouteDescriptor | undefined => {
  const segments = normalizePath(path).split('/');
  let match: UserRouteDescriptor | undefined;
  let matchScore = -1;
  for (const route of routes) {
    const score = routeMatchScore(route.path, segments);
    if (score !== undefined && score > matchScore) {
      match = route;
      matchScore = score;
    }
  }
  return match;
};

/** Navigation destination highlighted for `path`, or `undefined` for unknown URLs. */
export const activeUserNavPath = (routes: readonly UserRouteDescriptor[], path: string): string | undefined => {
  const match = matchUserRoute(routes, path);
  if (!match) {
    return undefined;
  }
  return hasNav(match) ? match.path : match.navParent;
};
