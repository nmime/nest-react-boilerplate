import { useEffect, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { ApiClientProvider } from "@app/api-client";
import { configureApiLocale } from "@app/api-client/support";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  useAuthShellStore,
  useI18n,
} from "@app/frontend-ui";
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

  return (
    <ApiClientProvider
      authToken={authStore.bearerToken}
      baseUrls={{
        admin: "",
        auth: getAuthApiBaseUrl(),
        user: getUserApiBaseUrl(),
      }}
    >
      {children}
    </ApiClientProvider>
  );
});

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
          </UiErrorBoundary>
        </FrontendQueryProvider>
      </UserAppApiClientProvider>
    </FrontendStateProvider>
  );
}
