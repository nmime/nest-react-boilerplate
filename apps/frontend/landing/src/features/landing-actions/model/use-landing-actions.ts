import { useSyncExternalStore } from 'react';
import { useI18n } from '@app/frontend-runtime';
import type { ProductShellAction } from '@app/frontend-ui-web';
import { getLandingFrontendEnv, landingRoutes } from '../../../shared/config';
import { getAuthApiDocsHref } from './get-auth-api-docs-href';

export interface LandingActionsState {
  actions: ProductShellAction[];
}

const getSafeAuthApiDocsHref = (): string => {
  try {
    return getAuthApiDocsHref(getLandingFrontendEnv());
  } catch {
    return landingRoutes.authDocs;
  }
};

const getSafeAppHref = (
  env: ReturnType<typeof getLandingFrontendEnv>,
  key: 'VITE_ADMIN_APP_URL' | 'VITE_USER_APP_URL',
  fallback: string,
): string => {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  try {
    const configuredValue = value.trim();
    if (configuredValue.startsWith('/') && !configuredValue.startsWith('//')) {
      const sameOriginBase = new URL('https://same-origin.invalid');
      const url = new URL(configuredValue, sameOriginBase);
      return url.origin === sameOriginBase.origin && url.search === '' && url.hash === '' ? url.pathname : fallback;
    }

    const url = new URL(configuredValue);
    const isLoopbackPage =
      globalThis.location.protocol === 'http:' &&
      (globalThis.location.hostname === '127.0.0.1' || globalThis.location.hostname === 'localhost');
    const isLoopbackHttp =
      isLoopbackPage && url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if (
      (url.protocol !== 'https:' && !isLoopbackHttp) ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return fallback;
    }

    return url.pathname === '/' ? url.origin : `${url.origin}${url.pathname}`;
  } catch {
    return fallback;
  }
};

interface AppHrefs {
  admin: string;
  user: string;
}

// `__APP_RUNTIME_CONFIG__` is injected by the serving container, so it exists on
// the client but never during Astro's server render. The island is `client:load`
// and would therefore hydrate against different hrefs than the server emitted.
// `useSyncExternalStore` is the supported way to declare that split: React uses
// the server snapshot for SSR/hydration and swaps in the client one afterwards.
const serverAppHrefs: AppHrefs = {
  admin: landingRoutes.adminApp,
  user: landingRoutes.userApp,
};

// The runtime config is injected once before the bundle evaluates and never
// changes, so there is nothing to subscribe to.
const subscribeToNothing = (): (() => void) => () => undefined;

const getServerAppHrefs = (): AppHrefs => serverAppHrefs;

// `getSnapshot` must return a referentially stable value or React re-renders
// forever, so only publish a new object when a resolved href actually changes.
let cachedAppHrefs: AppHrefs = serverAppHrefs;

const getClientAppHrefs = (): AppHrefs => {
  const env = getLandingFrontendEnv();
  const admin = getSafeAppHref(env, 'VITE_ADMIN_APP_URL', landingRoutes.adminApp);
  const user = getSafeAppHref(env, 'VITE_USER_APP_URL', landingRoutes.userApp);

  if (cachedAppHrefs.admin !== admin || cachedAppHrefs.user !== user) {
    cachedAppHrefs = { admin, user };
  }

  return cachedAppHrefs;
};

export const useLandingActionsState = (): LandingActionsState => {
  const { t } = useI18n();
  const docsHref = getSafeAuthApiDocsHref();
  const appHrefs = useSyncExternalStore(subscribeToNothing, getClientAppHrefs, getServerAppHrefs);

  const actions: ProductShellAction[] = [
    {
      href: appHrefs.user,
      label: t('landing.action.user'),
    },
    {
      href: appHrefs.admin,
      label: t('landing.action.admin'),
      variant: 'secondary',
    },
    {
      href: docsHref,
      label: t('landing.action.docs'),
      variant: 'secondary',
    },
  ];

  return { actions };
};
