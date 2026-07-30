import { useEffect, useState } from 'react';
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
    if (
      url.protocol !== 'https:' ||
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

export const useLandingActionsState = (): LandingActionsState => {
  const { t } = useI18n();
  const docsHref = getSafeAuthApiDocsHref();
  const [appHrefs, setAppHrefs] = useState<{ admin: string; user: string }>({
    admin: landingRoutes.adminApp,
    user: landingRoutes.userApp,
  });

  useEffect(() => {
    const env = getLandingFrontendEnv();
    setAppHrefs({
      admin: getSafeAppHref(env, 'VITE_ADMIN_APP_URL', landingRoutes.adminApp),
      user: getSafeAppHref(env, 'VITE_USER_APP_URL', landingRoutes.userApp),
    });
  }, []);

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
