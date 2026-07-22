import { useMemo, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { ApiClientProvider, authApiToastRules, userApiToastRules } from '@app/frontend-api-client';
import {
  configureApiLocale,
  createDefaultApiToastRules,
  createApiRuntimeFetch,
  useApiRuntimeOverlayModel,
} from '@app/frontend-api-support';
import {
  FrontendI18nProvider,
  MiniAppProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  translate,
  useAppStore,
  useI18n,
  useStore,
} from '@app/frontend-runtime';
import { UiApiRuntimeOverlay } from '@app/frontend-ui-web';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { useUserPreferenceControls } from '../../features/preferences';
import { getAuthApiBaseUrl, getFrontendEnv, getUserApiBaseUrl } from '../../shared/config';
import { UiErrorBoundary } from '../../shared/ui';
import { AuthRedirectBridge } from './auth-redirect-bridge';
import { UserRouter } from '../router/user-router';

const ApiClientLocaleBridge = ({ children }: Readonly<{ children: ReactNode }>) => {
  const { locale } = useI18n();
  configureApiLocale({ locale });

  return <>{children}</>;
};

const UserAppApiClientProvider = observer(function UserAppApiClientProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const runtimeFetch = useMemo(
    () =>
      createApiRuntimeFetch({
        emitUnauthenticatedAuthRequired: true,
        redirectTo: '/auth',
        toastRules: () => [...authApiToastRules, ...userApiToastRules, ...createDefaultApiToastRules()],
      }),
    [],
  );

  return (
    <ApiClientProvider
      baseUrls={{
        admin: '',
        auth: getAuthApiBaseUrl(),
        user: getUserApiBaseUrl(),
      }}
      fetchImpl={runtimeFetch}
      loadProblemPresentationOverrides={getFrontendEnv()['MODE'] !== 'test'}
    >
      {children}
    </ApiClientProvider>
  );
});

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
      redirectTo={state.redirectTo ?? '/auth'}
      status={state.status}
      toasts={toasts}
    />
  );
});

const UserAppRouterProviders = observer(function UserAppRouterProviders() {
  const preferences = useUserPreferenceControls();

  return (
    <FrontendI18nProvider
      onLocaleChange={preferences.persistUserLocale}
      onThemeChange={preferences.persistUserTheme}
      translations={userFrontendTranslations}
      userLocale={preferences.userLocale}
      userTheme={preferences.userTheme}
    >
      <ApiClientLocaleBridge>
        <UserRouter applyUserLocale={preferences.applyUserLocale} applyUserTheme={preferences.applyUserTheme} />
      </ApiClientLocaleBridge>
    </FrontendI18nProvider>
  );
});

export function AppProviders({ children }: Readonly<{ children?: ReactNode }> = {}) {
  return (
    <MiniAppProvider backgroundColor="#f8fafc" bottomBarColor="#0f172a" headerColor="#2563eb">
      <FrontendStateProvider>
        <UserAppApiClientProvider>
          <FrontendQueryProvider>
            <UiErrorBoundary>
              <AuthRedirectBridge />
              {children ?? <UserAppRouterProviders />}
              <ApiRuntimeOverlayProvider />
            </UiErrorBoundary>
          </FrontendQueryProvider>
        </UserAppApiClientProvider>
      </FrontendStateProvider>
    </MiniAppProvider>
  );
}
