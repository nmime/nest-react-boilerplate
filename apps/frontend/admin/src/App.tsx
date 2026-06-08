import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import {
  adminApi,
  authApi,
  throwOnOpenApiErrorData,
  type ApiClientRequestOptions,
} from "@app/api-client";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  UiErrorBoundary,
  UiLoading,
  UiSection,
  useI18n,
  type UiTheme,
} from "@app/frontend-ui";
import { createAdminAccess, fetchAdminProfile } from "./entities/admin-session";
import {
  getBrowserPath,
  getConfiguredAdminApiBaseUrl,
  getConfiguredAuthApiBaseUrl,
  type AuthMePayload,
} from "./features/admin-auth";
import { getPayloadTheme } from "./features/admin-preferences";
import { AuditPage } from "./pages/audit";
import { DashboardPage } from "./pages/dashboard";
import { ForbiddenPage } from "./pages/forbidden";
import { NotFoundPage } from "./pages/not-found";
import { ProfilePage } from "./pages/profile";
import { RolesPage } from "./pages/roles";
import { TenantRoadmapPage } from "./pages/tenants";
import { UsersPage } from "./pages/users";
import {
  fallbackTranslate,
  getInitialBearerToken,
  normalizeAdminPath,
  scrubLegacyAuthTokenParams,
  type AdminProfileState,
  type Translate,
} from "./shared";
import { AdminLayout } from "./widgets/admin-shell";

export interface AdminRouteRuntime {
  requestOptions?: ApiClientRequestOptions;
}

interface AdminAppProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  bearerToken: string | null;
}

/* eslint-disable sonarjs/cognitive-complexity -- route matrix is explicit for RBAC auditability. */
function renderReadyAdminRoute(
  path: string,
  state: Extract<AdminProfileState, { status: "ready" }>,
  t: Translate,
  runtime: AdminRouteRuntime,
): ReactElement {
  const routePath = normalizeAdminPath(path);
  if (routePath === "/" || routePath === "/dashboard") {
    return state.access.canReadDashboard ? (
      <DashboardPage
        access={state.access}
        requestOptions={runtime.requestOptions}
      />
    ) : (
      <ForbiddenPage reason={t("admin.permission.dashboardMissing")} />
    );
  }
  if (routePath.startsWith("/users")) {
    return state.access.canReadUsers ? (
      <UsersPage
        access={state.access}
        currentPath={path}
        requestOptions={runtime.requestOptions}
      />
    ) : (
      <ForbiddenPage reason={t("admin.permission.usersMissing")} />
    );
  }
  if (routePath === "/roles") {
    return state.access.canReadRoles ? (
      <RolesPage requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.rolesMissing")} />
    );
  }
  if (routePath === "/audit") {
    return state.access.canReadAudit ? (
      <AuditPage requestOptions={runtime.requestOptions} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.auditMissing")} />
    );
  }
  if (routePath === "/profile") {
    return state.access.canReadProfile ? (
      <ProfilePage payload={state.payload} />
    ) : (
      <ForbiddenPage reason={t("admin.permission.profileMissing")} />
    );
  }
  return routePath === "/tenants" ? <TenantRoadmapPage /> : <NotFoundPage />;
}
/* eslint-enable sonarjs/cognitive-complexity */

export function renderAdminRoute(
  path: string,
  state: AdminProfileState,
  t: Translate = fallbackTranslate,
  runtime: AdminRouteRuntime = {},
): ReactElement {
  if (state.status === "loading") {
    return (
      <UiSection
        eyebrow={t("admin.loadingEyebrow")}
        title={t("admin.loadingProfile")}
      >
        <UiLoading label={t("admin.loadingProfile")} />
      </UiSection>
    );
  }
  if (state.status === "forbidden") {
    return <ForbiddenPage reason={state.reason} />;
  }
  const rendered = renderReadyAdminRoute(path, state, t, runtime);
  return rendered;
}

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

const AdminWorkspace = ({
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

const AdminRoot = ({
  initialBearerToken,
}: Readonly<{ initialBearerToken: string | null }>) => {
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
      <AdminWorkspace
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
          <AdminRoot initialBearerToken={initialBearerToken} />
        </UiErrorBoundary>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
};

export default App;
