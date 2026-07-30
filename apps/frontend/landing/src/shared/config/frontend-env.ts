import { getFrontendRuntimeConfig, type FrontendEnv } from '@app/frontend-api-support';

export const getLandingFrontendEnv = (): FrontendEnv => {
  const runtimeConfig = getFrontendRuntimeConfig();
  const runtimeAdminAppUrl = runtimeConfig['adminAppUrl'];
  const runtimeUserAppUrl = runtimeConfig['userAppUrl'];

  return {
    ...(import.meta.env as FrontendEnv),
    ...(typeof runtimeAdminAppUrl === 'string' ? { VITE_ADMIN_APP_URL: runtimeAdminAppUrl } : {}),
    ...(typeof runtimeUserAppUrl === 'string' ? { VITE_USER_APP_URL: runtimeUserAppUrl } : {}),
  };
};
