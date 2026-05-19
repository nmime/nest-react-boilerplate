import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import { adminApi, authApi, throwOnOpenApiErrorData } from "@app/api-client";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  useAuthShellStore,
  useI18n,
  type UiTheme,
} from "@app/frontend-ui";
import {
  createAdminAccess,
  fetchAdminProfile,
  getAdminApiBaseUrl,
  resolveInitialBearerToken,
  saveBearerToken,
} from "./auth-rbac";
import {
  AdminLayout,
  DevTokenForm,
  type AdminProfileState,
  renderAdminRoute,
} from "./pages";

const getBrowserHref = (): string => window.location.href;

const getBrowserPath = (): string => window.location.pathname;

const getBrowserStorage = (): Storage | undefined => window.localStorage;

const getConfiguredAdminApiBaseUrl = (): string => {
  const env = import.meta.env as Readonly<Record<string, string | undefined>>;

  return getAdminApiBaseUrl(env["VITE_ADMIN_API_BASE_URL"]);
};

const getConfiguredAuthApiBaseUrl = (): string => {
  const env = import.meta.env as Readonly<Record<string, string | undefined>>;

  return getAdminApiBaseUrl(env["VITE_AUTH_API_BASE_URL"]);
};

interface AdminAppProps {
  token: string;
  setToken: (token: string) => void;
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

type AuthMePayload = authApi.AuthControllerMeData;

const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "system" ||
    normalized === "light" ||
    normalized === "dark"
    ? normalized
    : undefined;
};

const readTheme = (value: unknown): UiTheme | undefined =>
  normalizeTheme(
    value && typeof value === "object"
      ? (value as Record<string, unknown>)["theme"]
      : undefined,
  );

const getPayloadTheme = (
  payload:
    | AuthMePayload
    | Awaited<ReturnType<typeof fetchAdminProfile>>
    | null
    | undefined,
): UiTheme | undefined => {
  return (
    readTheme(payload) ??
    (payload && "user" in payload ? readTheme(payload.user) : undefined) ??
    (payload && "profile" in payload
      ? readTheme(payload.profile)
      : undefined) ??
    (payload && "principal" in payload
      ? readTheme(payload.principal)
      : undefined)
  );
};

async function fetchAuthMe(
  token: string,
  baseUrl: string,
): Promise<AuthMePayload | null> {
  try {
    const result = await authApi.authControllerMe({
      authToken: token,
      baseUrl,
    });
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

const getProfileState = (
  token: string,
  loading: boolean,
  payload: Awaited<ReturnType<typeof fetchAdminProfile>> | undefined,
  error: unknown,
  principalMissingMessage: string,
  profileRequestFailedMessage: string,
): AdminProfileState => {
  if (!token) {
    return { status: "missing-token" };
  }
  if (loading) {
    return { status: "loading" };
  }
  if (error) {
    return {
      status: "forbidden",
      reason:
        error instanceof Error ? error.message : profileRequestFailedMessage,
    };
  }

  const access = createAdminAccess(payload?.principal);
  return access.isAuthenticated
    ? { status: "ready", payload: payload ?? {}, access }
    : {
        status: "forbidden",
        reason: principalMissingMessage,
      };
};

const AdminApp = ({
  applyUserLocale,
  applyUserTheme,
  setToken,
  token,
}: Readonly<AdminAppProps>) => {
  const { locale, t } = useI18n();
  const [path] = useState(getBrowserPath);
  const authBaseUrl = getConfiguredAuthApiBaseUrl();

  const authMeQuery = useQuery({
    enabled: Boolean(token),
    queryFn: () => fetchAuthMe(token, authBaseUrl),
    queryKey: [...authApi.getAuthControllerMeQueryKey(), token, locale],
    retry: false,
    staleTime: 15_000,
  });
  const authLocale = normalizeLocale(
    authMeQuery.data?.user?.locale ?? authMeQuery.data?.principal?.locale,
  );
  const authTheme = getPayloadTheme(authMeQuery.data);

  useEffect(() => {
    if (authLocale) {
      applyUserLocale(authLocale);
    }
  }, [applyUserLocale, authLocale]);
  useEffect(() => {
    if (authTheme) {
      applyUserTheme(authTheme);
    }
  }, [applyUserTheme, authTheme]);

  const profileQuery = useQuery({
    enabled:
      Boolean(token) &&
      !authMeQuery.isLoading &&
      (!authLocale || authLocale === locale),
    queryFn: () => fetchAdminProfile(token, getConfiguredAdminApiBaseUrl()),
    queryKey: [
      ...adminApi.getAdminProfileControllerMeQueryKey(),
      token,
      locale,
    ],
    retry: false,
    staleTime: 15_000,
  });
  const payloadLocale = normalizeLocale(
    profileQuery.data?.profile?.locale ??
      profileQuery.data?.principal?.locale ??
      authLocale,
  );

  useEffect(() => {
    if (payloadLocale) {
      applyUserLocale(payloadLocale);
    }
  }, [applyUserLocale, payloadLocale]);

  const state = useMemo(
    () =>
      getProfileState(
        token,
        authMeQuery.isLoading || profileQuery.isLoading,
        profileQuery.data,
        profileQuery.error,
        t("errors.auth.principalMissing"),
        t("admin.error.profileRequestFailed"),
      ),
    [
      authMeQuery.isLoading,
      profileQuery.data,
      profileQuery.error,
      profileQuery.isLoading,
      t,
      token,
    ],
  );

  return (
    <AdminLayout>
      <DevTokenForm
        onSubmit={(nextToken) => {
          saveBearerToken(getBrowserStorage(), nextToken);
          setToken(nextToken.trim());
        }}
      />
      {renderAdminRoute(path, state, t)}
    </AdminLayout>
  );
};

const AppContent = observer(function AppContent() {
  const authShell = useAuthShellStore();
  const token = authShell.bearerToken ?? "";
  const setToken = useCallback(
    (nextToken: string) => authShell.setBearerToken(nextToken),
    [authShell],
  );
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authBaseUrl = getConfiguredAuthApiBaseUrl();

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: { locale?: Locale; theme?: UiTheme }) =>
      throwOnOpenApiErrorData(
        authApi.authControllerUpdatePreferences(nextPreferences, {
          authToken: token,
          baseUrl: authBaseUrl,
        }),
      ),
    onSuccess: (body, nextPreferences) => {
      const persistedLocale = normalizeLocale(body?.locale);
      const persistedTheme = getPayloadTheme(body);
      setUserLocale(
        persistedLocale ?? nextPreferences.locale ?? userLocale ?? null,
      );
      setUserTheme(
        persistedTheme ?? nextPreferences.theme ?? userTheme ?? null,
      );
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
    setUserLocale(nextLocale);
  }, []);
  const applyUserTheme = useCallback((nextTheme: UiTheme) => {
    setUserTheme(nextTheme);
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      if (!token) {
        return;
      }

      try {
        await preferencesMutation.mutateAsync({ locale: nextLocale });
      } catch {
        // Locale remains persisted locally and can be retried on the next switch.
      }
    },
    [preferencesMutation, token],
  );
  const persistUserTheme = useCallback(
    async (nextTheme: UiTheme) => {
      if (!token) {
        return;
      }

      try {
        await preferencesMutation.mutateAsync({ theme: nextTheme });
      } catch {
        // Theme remains persisted locally and can be retried on the next switch.
      }
    },
    [preferencesMutation, token],
  );

  return (
    <FrontendI18nProvider
      onLocaleChange={persistUserLocale}
      onThemeChange={persistUserTheme}
      userLocale={userLocale}
      userTheme={userTheme}
    >
      <AdminApp
        applyUserLocale={applyUserLocale}
        applyUserTheme={applyUserTheme}
        setToken={setToken}
        token={token}
      />
    </FrontendI18nProvider>
  );
});

const App = () => (
  <FrontendStateProvider
    initialBearerToken={resolveInitialBearerToken(
      getBrowserHref(),
      getBrowserStorage(),
    )}
  >
    <FrontendQueryProvider>
      <AppContent />
    </FrontendQueryProvider>
  </FrontendStateProvider>
);

export default App;
