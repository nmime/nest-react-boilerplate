import { useEffect, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { configureApiLocale } from "@app/api-client/support";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  useI18n,
} from "@app/frontend-ui";
import { useUserPreferenceControls } from "../../features/preferences";
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

export function AppProviders() {
  return (
    <FrontendStateProvider>
      <FrontendQueryProvider>
        <UiErrorBoundary>
          <UserAppRouterProviders />
        </UiErrorBoundary>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
}
