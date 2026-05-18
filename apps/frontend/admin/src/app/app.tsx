import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import {
  apiFetch,
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  useAuthShellStore,
  useI18n,
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

type AuthLocalePayload = {
  locale?: string | null;
  user?: { locale?: string | null };
};

type ApiEnvelope<T> = { data?: T };

interface AdminAppProps {
  token: string;
  setToken: (token: string) => void;
  applyUserLocale: (locale: Locale) => void;
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
  setToken,
  token,
}: Readonly<AdminAppProps>) => {
  const { locale, t } = useI18n();
  const [path] = useState(getBrowserPath);

  const profileQuery = useQuery({
    enabled: Boolean(token),
    queryFn: () => fetchAdminProfile(token, getConfiguredAdminApiBaseUrl()),
    queryKey: ["admin", "profile", "me", token, locale],
    retry: false,
    staleTime: 15_000,
  });
  const payloadLocale = normalizeLocale(
    profileQuery.data?.profile?.locale ?? profileQuery.data?.principal?.locale,
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
        profileQuery.isLoading,
        profileQuery.data,
        profileQuery.error,
        t("errors.auth.principalMissing"),
        t("admin.error.profileRequestFailed"),
      ),
    [profileQuery.data, profileQuery.error, profileQuery.isLoading, t, token],
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
  const queryClient = useQueryClient();

  const localeMutation = useMutation({
    mutationFn: (nextLocale: Locale) =>
      apiFetch<ApiEnvelope<AuthLocalePayload>>("/auth/me/locale", {
        authToken: token,
        baseUrl: getConfiguredAuthApiBaseUrl(),
        json: { locale: nextLocale },
        method: "PATCH",
      }),
    onSuccess: (body, nextLocale) => {
      const persistedLocale = normalizeLocale(
        body?.data?.locale ?? body?.data?.user?.locale,
      );
      setUserLocale(persistedLocale ?? nextLocale);
      void queryClient.invalidateQueries({ queryKey: ["admin", "profile"] });
    },
    retry: false,
  });

  const applyUserLocale = useCallback((nextLocale: Locale) => {
    setUserLocale(nextLocale);
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      if (!token) {
        return;
      }

      try {
        await localeMutation.mutateAsync(nextLocale);
      } catch {
        // Locale remains persisted locally and can be retried on the next switch.
      }
    },
    [localeMutation, token],
  );

  return (
    <FrontendI18nProvider
      onLocaleChange={persistUserLocale}
      userLocale={userLocale}
    >
      <AdminApp
        applyUserLocale={applyUserLocale}
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
