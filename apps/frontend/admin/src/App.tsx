import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import {
  configureApiLocale,
  createDefaultApiToastRules,
  createApiRuntimeFetch,
  getApiErrorDisplayMessage,
  useApiRuntimeOverlayModel,
} from '@app/frontend-api-support';
import {
  ApiClientProvider,
  adminApi,
  adminApiToastRules,
  authApi,
  authApiToastRules,
  throwOnOpenApiErrorData,
  useAdminApiClient,
  useAuthApiClient,
  type ApiClientRequestOptions,
} from '@app/frontend-api-client';
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  observer,
  translate,
  useAppStore,
  useI18n,
  useStore,
  normalizeLocale,
  type Locale,
  type UiTheme,
} from '@app/frontend-runtime';
import { UiErrorBoundary, UiApiRuntimeOverlay } from '@app/frontend-ui-web';
import { useSessionPreferenceControls } from '@app/frontend-feature-shared-preferences';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess, fetchAdminProfile } from './entities/admin-session';
import {
  getConfiguredAdminApiBaseUrl,
  getConfiguredAuthApiBaseUrl,
  getFrontendEnv,
  stripSensitiveBrowserTokenParams,
  type AuthMePayload,
} from './features/admin-auth';
import { getPayloadTheme } from './features/admin-preferences';
import { AdminRuntimeProvider } from './app/router/admin-runtime-context';
import { createAdminRouter } from './app/router/admin-route-tree';
import { type AdminProfileState } from './shared';

// The RBAC route matrix moved into the router module; re-exported so existing
// route/page tests can keep asserting the matrix directly.
export * from './app/router/admin-route-matrix';

interface AdminAppProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

async function fetchAuthMe(
  authClient: Pick<typeof authApi, 'authControllerMe'>,
  requestOptions?: ApiClientRequestOptions,
): Promise<AuthMePayload | null> {
  try {
    const result = await authClient.authControllerMe(requestOptions);
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

export const getProfileState = (
  loading: boolean,
  payload: Awaited<ReturnType<typeof fetchAdminProfile>> | undefined,
  error: unknown,
  principalMissingMessage: string,
  profileRequestFailedMessage: string,
): AdminProfileState => {
  if (loading) {
    return { status: 'loading' };
  }
  if (error) {
    return {
      status: 'forbidden',
      reason: getApiErrorDisplayMessage(error, profileRequestFailedMessage),
    };
  }

  const access = createAdminAccess(payload?.principal);
  /* v8 ignore next 4 -- authenticated payloads normalize missing envelope data to an empty profile shell. */
  return access.isAuthenticated
    ? { status: 'ready', payload: payload ?? {}, access }
    : {
        status: 'forbidden',
        reason: principalMissingMessage,
      };
};

const ApiClientLocaleBridge = ({ children }: Readonly<{ children: ReactElement }>) => {
  const { locale } = useI18n();
  configureApiLocale({ locale });

  return children;
};

const AdminWorkspace = ({ applyUserLocale, applyUserTheme }: Readonly<AdminAppProps>) => {
  const { locale, t } = useI18n();
  const authClient = useAuthApiClient();
  const adminClient = useAdminApiClient();
  const queryClient = useQueryClient();
  // Strip sensitive token query params from the entry URL before the router
  // reads location (previously done via getBrowserPath at mount).
  const [router] = useState(() => {
    stripSensitiveBrowserTokenParams();
    return createAdminRouter();
  });

  const authMeQuery = useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: () => fetchAuthMe(authClient.api, authClient.requestOptions),
    queryKey: [...authApi.getAuthControllerMeQueryKey(), locale],
    retry: false,
    staleTime: 15_000,
  });
  const authLocale = normalizeLocale(authMeQuery.data?.user?.locale ?? authMeQuery.data?.principal.locale);
  const authTheme = getPayloadTheme(authMeQuery.data);

  const profileQuery = useQuery({
    enabled: !authMeQuery.isLoading,
    placeholderData: (previousData) => previousData,
    queryFn: () => fetchAdminProfile(adminClient.api, adminClient.requestOptions),
    queryKey: [...adminApi.getAdminProfileControllerMeQueryKey(), locale],
    retry: false,
    staleTime: 15_000,
  });
  const profileLocale = normalizeLocale(profileQuery.data?.profile?.locale ?? profileQuery.data?.principal?.locale);
  const profileTheme = getPayloadTheme(profileQuery.data);
  const serverLocale = authLocale ?? profileLocale;
  const serverTheme = authTheme ?? profileTheme;

  useEffect(() => {
    if (serverLocale) {
      applyUserLocale(serverLocale);
    }
  }, [applyUserLocale, serverLocale]);
  useEffect(() => {
    if (serverTheme) {
      applyUserTheme(serverTheme);
    }
  }, [applyUserTheme, serverTheme]);

  const state = useMemo(
    () =>
      getProfileState(
        authMeQuery.isLoading || profileQuery.isLoading,
        profileQuery.data,
        profileQuery.error,
        t('errors.auth.principalMissing'),
        t('admin.error.profileRequestFailed'),
      ),
    [authMeQuery.isLoading, profileQuery.data, profileQuery.error, profileQuery.isLoading, t],
  );

  const adminRequestOptions = adminClient.requestOptions;
  const signOutMutation = useMutation({
    mutationFn: () => throwOnOpenApiErrorData(authApi.authControllerLogout(authClient.requestOptions)),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authApi.getAuthControllerMeQueryKey() }),
        queryClient.invalidateQueries({ queryKey: adminApi.getAdminProfileControllerMeQueryKey() }),
      ]);
    },
    retry: false,
  });

  return (
    <AdminRuntimeProvider
      value={{
        state,
        requestOptions: adminRequestOptions,
        isSigningOut: signOutMutation.isPending,
        onSignOut: () => {
          signOutMutation.mutate();
        },
      }}
    >
      <RouterProvider router={router} />
    </AdminRuntimeProvider>
  );
};

const AdminRoot = () => {
  // The admin console shares the user apps' preference model. `guardExplicitOverrides`
  // keeps a server-derived locale/theme from clobbering a choice the admin has
  // explicitly made; the admin profile query is refreshed alongside auth/me.
  const preferences = useSessionPreferenceControls({
    guardExplicitOverrides: true,
    invalidateQueryKeys: () => [adminApi.getAdminProfileControllerMeQueryKey()],
  });

  return (
    <FrontendI18nProvider
      onLocaleChange={preferences.persistUserLocale}
      onThemeChange={preferences.persistUserTheme}
      translations={adminFrontendTranslations}
      userLocale={preferences.userLocale}
      userTheme={preferences.userTheme}
    >
      <ApiClientLocaleBridge>
        <AdminWorkspace applyUserLocale={preferences.applyUserLocale} applyUserTheme={preferences.applyUserTheme} />
      </ApiClientLocaleBridge>
    </FrontendI18nProvider>
  );
};

const AdminApiClientProvider = ({ children }: Readonly<{ children: ReactElement }>) => {
  const runtimeFetch = useMemo(
    () =>
      createApiRuntimeFetch({
        emitUnauthenticatedAuthRequired: true,
        redirectTo: '/admin',
        toastRules: () => [...adminApiToastRules, ...authApiToastRules, ...createDefaultApiToastRules()],
      }),
    [],
  );

  return (
    <ApiClientProvider
      baseUrls={{
        admin: getConfiguredAdminApiBaseUrl(),
        auth: getConfiguredAuthApiBaseUrl(),
        user: '',
      }}
      fetchImpl={runtimeFetch}
      loadProblemPresentationOverrides={getFrontendEnv()['MODE'] !== 'test'}
    >
      {children}
    </ApiClientProvider>
  );
};

const ApiRuntimeOverlayProvider = observer(function ApiRuntimeOverlayProvider() {
  const appStore = useAppStore();
  const locale = useStore().locale.locale;
  const { dismissToast, state, toasts } = useApiRuntimeOverlayModel();

  return (
    <UiApiRuntimeOverlay
      authRequired={state.authRequired}
      className={`xr-runtime-overlay--${appStore.currentBreakpoint}`}
      copy={{
        apiNotificationsLabel: translate('ui.runtime.notifications.label', {
          locale,
        }),
        authRequiredTitle: translate('ui.runtime.authRequired.title', {
          locale,
        }),
        continueToSignInLabel: translate('ui.runtime.authRequired.continue', {
          locale,
        }),
        defaultAuthDescription: translate('ui.runtime.authRequired.description', { locale }),
        defaultOfflineMessage: translate('ui.runtime.offline.description', {
          locale,
        }),
        defaultServerErrorMessage: translate('ui.runtime.serverUnavailable.description', { locale }),
        dismissLabel: translate('ui.runtime.dismissToast', { locale }),
        offlineTitle: translate('ui.runtime.offline.title', { locale }),
        serverErrorTitle: translate('ui.runtime.serverUnavailable.title', {
          locale,
        }),
      }}
      lastError={state.lastError}
      onDismissToast={dismissToast}
      redirectTo={state.redirectTo ?? '/admin'}
      status={state.status}
      toasts={toasts}
    />
  );
});

const App = ({ testChild }: Readonly<{ testChild?: ReactElement }> = {}) => (
  <FrontendStateProvider>
    {/* Admin auth is exclusively an HttpOnly cookie session. */}
    <AdminApiClientProvider>
      <FrontendQueryProvider>
        <UiErrorBoundary>
          {testChild ?? <AdminRoot />}
          <ApiRuntimeOverlayProvider />
        </UiErrorBoundary>
      </FrontendQueryProvider>
    </AdminApiClientProvider>
  </FrontendStateProvider>
);

export default App;
