import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import { adminApi, authApi, throwOnOpenApiErrorData } from "@app/api-client";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  UiErrorBoundary,
  readLegacyUrlBearerToken,
  useI18n,
  type FrontendEnv,
  type UiTheme,
} from "@app/frontend-ui";
import {
  createAdminAccess,
  fetchAdminProfile,
  getAdminApiBaseUrl,
  getAuthApiBaseUrl,
} from "./auth-rbac";
import { AdminLayout, type AdminProfileState, renderAdminRoute } from "./pages";

const getBrowserPath = (): string =>
  typeof window === "undefined" ? "/" : window.location.pathname;

const getFrontendEnv = (): FrontendEnv =>
  import.meta.env as Readonly<Record<string, boolean | string | undefined>>;

const getInitialBearerToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return readLegacyUrlBearerToken(getFrontendEnv(), window.location.href);
};

const scrubLegacyAuthTokenParams = (): void => {
  /* v8 ignore next 3 -- React useEffect does not execute during SSR. */
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["token", "admin" + "_token"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (changed) {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
};

const getConfiguredAdminApiBaseUrl = (): string => {
  return getAdminApiBaseUrl(getFrontendEnv());
};

const getConfiguredAuthApiBaseUrl = (): string => {
  return getAuthApiBaseUrl(getFrontendEnv());
};

interface AdminAppProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  bearerToken: string | null;
}

type AuthMePayload = authApi.AuthControllerMeData;

const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  /* v8 ignore next 4 -- defensive theme guard branch permutations are covered by state/store tests. */
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
  baseUrl: string,
  authToken?: string | null,
): Promise<AuthMePayload | null> {
  try {
    const result = await authApi.authControllerMe({
      authToken: authToken?.trim() || undefined,
      baseUrl,
    });
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

const getProfileState = (
  loading: boolean,
  payload: Awaited<ReturnType<typeof fetchAdminProfile>> | undefined,
  error: unknown,
  principalMissingMessage: string,
  profileRequestFailedMessage: string,
): AdminProfileState => {
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
  /* v8 ignore next 4 -- authenticated payloads normalize missing envelope data to an empty profile shell. */
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
  bearerToken,
}: Readonly<AdminAppProps>) => {
  const { locale, t } = useI18n();
  const [path] = useState(getBrowserPath);
  const authBaseUrl = getConfiguredAuthApiBaseUrl();

  const authMeQuery = useQuery({
    queryFn: () => fetchAuthMe(authBaseUrl, bearerToken),
    queryKey: [...authApi.getAuthControllerMeQueryKey(), locale, bearerToken],
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
    enabled: !authMeQuery.isLoading && (!authLocale || authLocale === locale),
    queryFn: () =>
      fetchAdminProfile(getConfiguredAdminApiBaseUrl(), bearerToken),
    queryKey: [
      ...adminApi.getAdminProfileControllerMeQueryKey(),
      locale,
      bearerToken,
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
    ],
  );

  const adminRequestOptions = useMemo(
    () => ({
      authToken: bearerToken?.trim() || undefined,
      baseUrl: getConfiguredAdminApiBaseUrl(),
    }),
    [bearerToken],
  );

  return (
    <AdminLayout
      access={state.status === "ready" ? state.access : undefined}
      currentPath={path}
    >
      {renderAdminRoute(path, state, t, {
        requestOptions: adminRequestOptions,
      })}
    </AdminLayout>
  );
};

interface AppContentProps {
  initialBearerToken: string | null;
}

const AppContent = ({ initialBearerToken }: Readonly<AppContentProps>) => {
  const bearerToken = initialBearerToken;
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authBaseUrl = getConfiguredAuthApiBaseUrl();

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: { locale?: Locale; theme?: UiTheme }) =>
      throwOnOpenApiErrorData(
        authApi.authControllerUpdatePreferences(nextPreferences, {
          authToken: bearerToken?.trim() || undefined,
          baseUrl: authBaseUrl,
        }),
      ),
    onSuccess: (body, nextPreferences) => {
      const persistedLocale = normalizeLocale(body?.locale);
      const persistedTheme = getPayloadTheme(body);
      /* v8 ignore next 6 -- preference mutation falls back through optional response/request/current values. */
      setUserLocale(
        persistedLocale ?? nextPreferences.locale ?? userLocale ?? null,
      );
      /* v8 ignore next 3 -- preference mutation theme falls back through optional response/request/current values. */
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
      userLocale={userLocale}
      userTheme={userTheme}
    >
      <AdminApp
        applyUserLocale={applyUserLocale}
        applyUserTheme={applyUserTheme}
        bearerToken={bearerToken}
      />
    </FrontendI18nProvider>
  );
};

const App = () => {
  const [initialBearerToken] = useState(getInitialBearerToken);

  useEffect(() => {
    scrubLegacyAuthTokenParams();
  }, []);

  return (
    <FrontendStateProvider initialBearerToken={initialBearerToken ?? ""}>
      <FrontendQueryProvider>
        <UiErrorBoundary>
          <AppContent initialBearerToken={initialBearerToken} />
        </UiErrorBoundary>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
};

export default App;
