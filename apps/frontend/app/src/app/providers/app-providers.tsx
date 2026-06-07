import { useCallback, useEffect, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Locale } from "@app/common/i18n";
import { configureApiLocale } from "@app/api-client/support";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  useAuthShellStore,
  useI18n,
  type UiTheme,
} from "@app/frontend-ui";
import { UiErrorBoundary } from "../../shared/ui";
import {
  readInitialBearerToken,
  scrubLegacyAuthTokenParams,
} from "../../entities/session";
import { profileQueryKey } from "../../entities/profile/api";
import {
  authPreferencesQueryKey,
  updateUserPreferences,
} from "../../features/preferences";
import { getPayloadLocale, getPayloadTheme } from "../../entities/profile";
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
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const bearerToken = authStore.bearerToken;

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: { locale?: Locale; theme?: UiTheme }) =>
      updateUserPreferences(bearerToken, nextPreferences),
    onSuccess: (body, nextPreferences) => {
      /* v8 ignore next 6 -- preference mutation falls back through optional response/request/current values. */
      setUserLocale(
        getPayloadLocale(body) ?? nextPreferences.locale ?? userLocale ?? null,
      );
      setUserTheme(
        getPayloadTheme(body) ?? nextPreferences.theme ?? userTheme ?? null,
      );
      void queryClient.invalidateQueries({
        queryKey: authPreferencesQueryKey(),
      });
      void queryClient.invalidateQueries({ queryKey: profileQueryKey() });
    },
    retry: false,
  });

  const applyUserLocale = useCallback((nextLocale: Locale) => {
    setUserLocale(nextLocale);
  }, []);
  const applyUserTheme = useCallback((nextTheme: UiTheme) => {
    setUserTheme(nextTheme);
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      try {
        await preferencesMutation.mutateAsync({ locale: nextLocale });
      } catch {
        // Locale is still persisted locally; retry on the next explicit change.
      }
    },
    [preferencesMutation],
  );
  const persistUserTheme = useCallback(
    async (nextTheme: UiTheme) => {
      try {
        await preferencesMutation.mutateAsync({ theme: nextTheme });
      } catch {
        // Theme is still persisted locally; retry on the next explicit change.
      }
    },
    [preferencesMutation],
  );

  return (
    <FrontendI18nProvider
      onLocaleChange={persistUserLocale}
      onThemeChange={persistUserTheme}
      userLocale={userLocale}
      userTheme={userTheme}
    >
      <ApiClientLocaleBridge>
        <UserRouter
          applyUserLocale={applyUserLocale}
          applyUserTheme={applyUserTheme}
        />
      </ApiClientLocaleBridge>
    </FrontendI18nProvider>
  );
});

export function AppProviders() {
  const [initialBearerToken] = useState(readInitialBearerToken);

  useEffect(() => {
    scrubLegacyAuthTokenParams();
  }, []);

  return (
    <FrontendStateProvider initialBearerToken={initialBearerToken}>
      <FrontendQueryProvider>
        <UiErrorBoundary>
          <UserAppRouterProviders />
        </UiErrorBoundary>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
}
