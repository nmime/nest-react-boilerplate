import { useEffect } from 'react';
import {
  apiRuntimeEvents,
  clearApiAuthRequired,
  resolveAuthRequiredAction,
  type AuthRequiredPolicy,
  type AuthRequiredPolicyContext,
} from '@app/frontend-api-support';
import { isTmaApp, type TmaEnvironment } from '@app/frontend-runtime';

const defaultAuthRoute = '/auth';

const normalizePath = (path: string): string => {
  /* v8 ignore next -- browser location.pathname and sanitized auth routes are never blank; fallback keeps the helper total. */
  const normalized = path.trim() || '/';
  return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
};

const safeInternalPath = (value: string | null | undefined): string | null => {
  if (!value?.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  const url = new URL(value, globalThis.location.origin);
  return `${url.pathname}${url.search}`;
};

const isAuthRoute = (path: string, authRoute: string): boolean => {
  const route = normalizePath(path);
  const normalizedAuthRoute = normalizePath(authRoute);
  return route === normalizedAuthRoute || route.startsWith(`${normalizedAuthRoute}/`);
};

const isTelegramRoute = (path: string): boolean => {
  const route = normalizePath(path);
  return route === '/tma' || route === '/tma/auth' || route === '/telegram-mini-app' || route === '/link/telegram';
};

const tmaEnvironment = (): TmaEnvironment => {
  const env = import.meta.env as Partial<Record<keyof TmaEnvironment, string | undefined>>;
  return {
    VITE_TMA_APP: env.VITE_TMA_APP,
  };
};

const currentReturnUrl = (): string => {
  const pathname = globalThis.location.pathname;
  const search = globalThis.location.search;
  /* v8 ignore next -- pathname comes from browser location and always starts with "/", so safeInternalPath cannot reject it. */
  return safeInternalPath(`${pathname}${search}`) ?? '/';
};

const buildAuthRedirectUrl = (redirectTo: string | undefined, returnUrl: string): string => {
  const authRoute = safeInternalPath(redirectTo) ?? defaultAuthRoute;
  const url = new URL(authRoute, globalThis.location.origin);
  url.searchParams.set('returnUrl', returnUrl);
  return `${url.pathname}${url.search}`;
};

const navigateReplace = (to: string): void => {
  globalThis.history.replaceState(null, '', to);
  globalThis.dispatchEvent(new Event('popstate'));
};

/**
 * The rules this app owns. A product adds its own through the `policy` prop rather than editing
 * this file, so a surface that legitimately 401s never has to become a route literal in here.
 */
const appAuthRequiredPolicy: AuthRequiredPolicy = {
  isAuthRoute: ({ event, pathname }) => isAuthRoute(pathname, safeInternalPath(event.redirectTo) ?? defaultAuthRoute),
  suppressRedirect: ({ pathname }) => isTelegramRoute(pathname) || isTmaApp(tmaEnvironment()),
};

/** Product rules run first; whichever of the two says "not a redirect" wins. */
const mergePolicies = (product: AuthRequiredPolicy): AuthRequiredPolicy => {
  const either =
    (key: keyof AuthRequiredPolicy) =>
    (context: AuthRequiredPolicyContext): boolean =>
      product[key]?.(context) === true || appAuthRequiredPolicy[key]?.(context) === true;

  return {
    isAuthRoute: either('isAuthRoute'),
    suppressRedirect: either('suppressRedirect'),
    tolerate: either('tolerate'),
  };
};

export interface AuthRedirectBridgeProps {
  /** Extra rules layered on top of the app's own; see {@link AuthRequiredPolicy}. */
  readonly policy?: AuthRequiredPolicy;
}

export const AuthRedirectBridge = ({ policy }: AuthRedirectBridgeProps = {}) => {
  useEffect(() => {
    const effectivePolicy = policy ? mergePolicies(policy) : appAuthRequiredPolicy;

    return apiRuntimeEvents.subscribe((event) => {
      if (event.type !== 'auth-required') {
        return;
      }

      const action = resolveAuthRequiredAction({ event, pathname: globalThis.location.pathname }, effectivePolicy);
      if (action === 'ignore') {
        return;
      }

      clearApiAuthRequired();
      if (action === 'redirect') {
        navigateReplace(buildAuthRedirectUrl(event.redirectTo, currentReturnUrl()));
      }
    });
  }, [policy]);

  return null;
};
