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

export const useLandingActionsState = (): LandingActionsState => {
  const { t } = useI18n();
  const docsHref = getSafeAuthApiDocsHref();

  const actions: ProductShellAction[] = [
    { href: landingRoutes.userApp, label: t('landing.action.user') },
    {
      href: landingRoutes.adminApp,
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
