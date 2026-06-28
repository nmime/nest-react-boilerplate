import { useEffect, useMemo, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { ApiClientProvider } from "@app/frontend/api-client";
import {
  configureApiLocale,
  createApiRuntimeFetch,
  useApiRuntimeOverlayModel,
} from "@app/frontend/api-support";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  UiApiRuntimeOverlay,
  useAuthShellStore,
  useAppStore,
  useI18n,
} from "@app/frontend/ui";
import { useUserPreferenceControls } from "../../features/preferences";
import { getAuthApiBaseUrl, getUserApiBaseUrl } from "../../shared/config";
import { UiErrorBoundary } from "../../shared/ui";
import { UserRouter } from "../router/user-router";

const ApiClientLocaleBridge = ({
  children,
}: Readonly<{ children: ReactNode }>) => {
  const { locale } = useI18n();
  useEffect(() => {
    configureApiLocale({ locale });
  }, [locale]);

  return <>{children}</>;
};

const UserAppApiClientProvider = observer(function UserAppApiClientProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const authStore = useAuthShellStore();
  const runtimeFetch = useMemo(
    () => createApiRuntimeFetch({ redirectTo: "/auth" }),
    [],
  );

  return (
    <ApiClientProvider
      authToken={authStore.bearerToken}
      baseUrls={{
        admin: "",
        auth: getAuthApiBaseUrl(),
        user: getUserApiBaseUrl(),
      }}
      fetchImpl={runtimeFetch}
    >
      {children}
    </ApiClientProvider>
  );
});

const ApiRuntimeOverlayProvider = observer(
  function ApiRuntimeOverlayProvider() {
    const appStore = useAppStore();
    const { dismissToast, state, toasts } = useApiRuntimeOverlayModel();

    return (
      <UiApiRuntimeOverlay
        authRequired={state.authRequired}
        className={`xr-runtime-overlay--${appStore.currentBreakpoint}`}
        lastError={state.lastError}
        onDismissToast={dismissToast}
        redirectTo={state.redirectTo ?? "/auth"}
        status={state.status}
        toasts={toasts}
      />
    );
  },
);

const UserAppRouterProviders = observer(function UserAppRouterProviders() {
  const preferences = useUserPreferenceControls();

  return (
    <FrontendI18nProvider
      onLocaleChange={preferences.persistUserLocale}
      onThemeChange={preferences.persistUserTheme}
      userLocale={preferences.userLocale}
      userTheme={preferences.userTheme}
    >
      <ApiClientLocaleBridge>
        <UserRouter
          applyUserLocale={preferences.applyUserLocale}
          applyUserTheme={preferences.applyUserTheme}
        />
      </ApiClientLocaleBridge>
    </FrontendI18nProvider>
  );
});

export function AppProviders({
  children,
}: Readonly<{ children?: ReactNode }> = {}) {
  return (
    <FrontendStateProvider>
      <UserAppApiClientProvider>
        <FrontendQueryProvider>
          <UiErrorBoundary>
            {children ?? <UserAppRouterProviders />}
            <ApiRuntimeOverlayProvider />
          </UiErrorBoundary>
        </FrontendQueryProvider>
      </UserAppApiClientProvider>
    </FrontendStateProvider>
  );
}
