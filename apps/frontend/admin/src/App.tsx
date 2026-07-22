import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { UiErrorBoundary, UiApiRuntimeOverlay, UiLoading, UiSection } from '@app/frontend-ui-web';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess, fetchAdminProfile } from './entities/admin-session';
import {
  getBrowserPath,
  getConfiguredAdminApiBaseUrl,
  getConfiguredAuthApiBaseUrl,
  getFrontendEnv,
  type AuthMePayload,
} from './features/admin-auth';
import { getPayloadTheme } from './features/admin-preferences';
import { AuditPage } from './pages/audit';
import { AuthLoginAnalyticsPage } from './pages/auth-login-analytics';
import { DashboardPage } from './pages/dashboard';
import { FeatureFlagsPage } from './pages/feature-flags';
import { ForbiddenPage } from './pages/forbidden';
import { NotFoundPage } from './pages/not-found';
import { NotificationBroadcastsPage } from './pages/notification-broadcasts';
import { NotificationSegmentsPage } from './pages/notification-segments';
import { NotificationTemplatesPage } from './pages/notification-templates';
import { ProfilePage } from './pages/profile';
import { ProblemPresentationsPage } from './pages/problem-presentations';
import { RolesPage } from './pages/roles';
import { UsersPage } from './pages/users';
import { fallbackTranslate, isUsersRoute, normalizeAdminPath, type AdminProfileState, type Translate } from './shared';
import { AdminLayout } from './widgets/admin-shell';

export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}

interface AdminAppProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

/* eslint-disable sonarjs/cognitive-complexity -- route matrix is explicit for RBAC auditability. */
function renderReadyAdminRoute(
  path: string,
  state: Extract<AdminProfileState, { status: 'ready' }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): ReactElement {
  const routePath = normalizeAdminPath(path);
  if (routePath === '/' || routePath === '/dashboard') {
    return state.access.canReadDashboard ? (
      <DashboardPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.dashboardMissing')} />
    );
  }
  if (isUsersRoute(routePath)) {
    return state.access.canReadUsers ? (
      <UsersPage access={state.access} currentPath={path} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.usersMissing')} />
    );
  }
  if (routePath === '/roles') {
    return state.access.canReadRoles ? (
      <RolesPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.rolesMissing')} />
    );
  }
  if (routePath === '/audit' || routePath.startsWith('/audit/')) {
    return state.access.canReadAudit ? (
      <AuditPage currentPath={path} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.auditMissing')} />
    );
  }
  if (routePath === '/auth/login-analytics') {
    return state.access.canReadAuthLoginAnalytics ? (
      <AuthLoginAnalyticsPage currentPath={path} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.authLoginAnalyticsMissing')} />
    );
  }
  if (routePath === '/profile') {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.profileMissing')} />
    );
  }
  if (routePath === '/settings/errors') {
    return state.access.canReadSettings ? (
      <ProblemPresentationsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.settingsMissing')} />
    );
  }
  if (routePath === '/settings/feature-flags') {
    return state.access.canReadFeatureFlags ? (
      <FeatureFlagsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.featureFlagsMissing')} />
    );
  }
  if (routePath === '/notifications/templates') {
    return state.access.canReadNotificationTemplates ? (
      <NotificationTemplatesPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.notificationTemplatesMissing')} />
    );
  }
  if (routePath === '/notifications/segments') {
    return state.access.canReadNotificationSegments ? (
      <NotificationSegmentsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.notificationSegmentsMissing')} />
    );
  }
  if (routePath === '/notifications/broadcasts') {
    return state.access.canReadNotificationBroadcasts ? (
      <NotificationBroadcastsPage access={state.access} requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t('admin.permission.notificationBroadcastsMissing')} />
    );
  }
  return <NotFoundPage />;
}
/* eslint-enable sonarjs/cognitive-complexity */

export function renderAdminRoute(
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
  runtime: AdminRouteRuntime = {},
): ReactElement {
  if (state.status === 'loading') {
    return (
      <UiSection eyebrow={t('admin.loadingEyebrow')} headingLevel={1} title={t('admin.loadingProfile')}>
        <UiLoading label={t('admin.loadingProfile')} />
      </UiSection>
    );
  }
  if (state.status === 'forbidden') {
    return <ForbiddenPage reason={state.reason} />;
  }
  const rendered = renderReadyAdminRoute(path, state, t, runtime);
  return rendered;
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
  const [path] = useState(getBrowserPath);

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
  const renderedRoute = renderAdminRoute(path, state, t, {
    requestOptions: adminRequestOptions,
  });

  if (state.status !== 'ready') {
    return <main id="xr-content">{renderedRoute}</main>;
  }

  return (
    <AdminLayout
      access={state.access}
      currentPath={path}
      isSigningOut={signOutMutation.isPending}
      onSignOut={() => {
        signOutMutation.mutate();
      }}
    >
      {renderedRoute}
    </AdminLayout>
  );
};

const AdminRoot = () => {
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const explicitLocale = useRef<Locale | null>(null);
  const explicitTheme = useRef<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authClient = useAuthApiClient();

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: { locale?: Locale; theme?: UiTheme }) =>
      throwOnOpenApiErrorData(
        authApi.authControllerUpdatePreferences(nextPreferences, {
          ...authClient.requestOptions,
        }),
      ),
    onSuccess: (body, nextPreferences) => {
      const persistedLocale = normalizeLocale(body.locale);
      const persistedTheme = getPayloadTheme(body);
      explicitLocale.current = persistedLocale ?? nextPreferences.locale ?? explicitLocale.current;
      explicitTheme.current = persistedTheme ?? nextPreferences.theme ?? explicitTheme.current;
      /* v8 ignore next 6 -- preference mutation falls back through optional response/request/current values. */
      setUserLocale(persistedLocale ?? nextPreferences.locale ?? userLocale ?? null);
      /* v8 ignore next 3 -- preference mutation theme falls back through optional response/request/current values. */
      setUserTheme(persistedTheme ?? nextPreferences.theme ?? userTheme ?? null);
      void queryClient.invalidateQueries({
        queryKey: authApi.getAuthControllerMeQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: adminApi.getAdminProfileControllerMeQueryKey(),
      });
    },
    retry: false,
  });

  const applyUserLocale = useCallback((nextLocale: Locale) => {
    if (!explicitLocale.current) {
      setUserLocale(nextLocale);
    }
  }, []);
  const applyUserTheme = useCallback((nextTheme: UiTheme) => {
    if (!explicitTheme.current) {
      setUserTheme(nextTheme);
    }
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      explicitLocale.current = nextLocale;
      setUserLocale(nextLocale);
      try {
        await preferencesMutation.mutateAsync({ locale: nextLocale });
      } catch {
        // Locale remains persisted locally and can be retried on the next switch.
      }
    },
    [preferencesMutation],
  );
  const persistUserTheme = useCallback(
    async (nextTheme: UiTheme) => {
      explicitTheme.current = nextTheme;
      setUserTheme(nextTheme);
      try {
        await preferencesMutation.mutateAsync({ theme: nextTheme });
      } catch {
        // Theme remains persisted locally and can be retried on the next switch.
      }
    },
    [preferencesMutation],
  );

  return (
    <FrontendI18nProvider
      onLocaleChange={persistUserLocale}
      onThemeChange={persistUserTheme}
      translations={adminFrontendTranslations}
      userLocale={userLocale}
      userTheme={userTheme}
    >
      <ApiClientLocaleBridge>
        <AdminWorkspace applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} />
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
