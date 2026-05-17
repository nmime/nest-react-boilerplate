import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { normalizeLocale } from "@app/common/i18n";
import {
  createFrontendQueryClient,
  fetchAdminProfile,
  getAdminApiBaseUrl,
  getAuthApiBaseUrl,
  persistAuthLocale,
} from "@app/frontend-api-client";
import { FrontendI18nProvider, useI18n } from "@app/frontend-ui";
import {
  createAdminAccess,
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

  return getAuthApiBaseUrl(env["VITE_AUTH_API_BASE_URL"]);
};

interface AdminAppProps {
  token: string;
  setToken: (token: string) => void;
  applyUserLocale: (locale: "en" | "es") => void;
}

const AdminApp = ({
  applyUserLocale,
  setToken,
  token,
}: Readonly<AdminAppProps>) => {
  const { locale, t } = useI18n();
  const [path] = useState(getBrowserPath);
  const profileQuery = useQuery({
    enabled: Boolean(token),
    queryFn: () =>
      fetchAdminProfile(token, locale, getConfiguredAdminApiBaseUrl()),
    queryKey: ["admin-profile", token, locale],
  });

  useEffect(() => {
    const nextLocale = normalizeLocale(
      profileQuery.data?.profile?.locale ??
        profileQuery.data?.principal?.locale,
    );
    if (nextLocale && nextLocale !== locale) {
      applyUserLocale(nextLocale);
    }
  }, [applyUserLocale, locale, profileQuery.data]);

  let state: AdminProfileState;
  if (!token) {
    state = { status: "missing-token" };
  } else if (profileQuery.isPending) {
    state = { status: "loading" };
  } else if (profileQuery.isError) {
    state = {
      status: "forbidden",
      reason:
        profileQuery.error instanceof Error
          ? profileQuery.error.message
          : "Profile request failed.",
    };
  } else {
    const payload = profileQuery.data ?? {};
    const access = createAdminAccess(payload.principal);

    state = access.isAuthenticated
      ? { status: "ready", payload, access }
      : {
          status: "forbidden",
          reason: t("errors.auth.principalMissing"),
        };
  }

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

const AdminAppRoot = () => {
  const [token, setToken] = useState(() =>
    resolveInitialBearerToken(getBrowserHref(), getBrowserStorage()),
  );
  const [userLocale, setUserLocale] = useState<"en" | "es" | null>(null);
  const localeMutation = useMutation({
    mutationFn: (nextLocale: "en" | "es") => {
      if (!token) {
        return Promise.resolve(undefined);
      }

      return persistAuthLocale(
        token,
        nextLocale,
        getConfiguredAuthApiBaseUrl(),
      );
    },
    onSuccess: (payload, nextLocale) => {
      const persistedLocale = normalizeLocale(
        payload && "locale" in payload ? payload.locale : payload?.user?.locale,
      );
      setUserLocale(persistedLocale ?? nextLocale);
    },
  });

  const applyUserLocale = useCallback((nextLocale: "en" | "es") => {
    setUserLocale(nextLocale);
  }, []);

  return (
    <FrontendI18nProvider
      onLocaleChange={(nextLocale) => {
        localeMutation.mutate(nextLocale);
      }}
      userLocale={userLocale}
    >
      <AdminApp
        applyUserLocale={applyUserLocale}
        setToken={setToken}
        token={token}
      />
    </FrontendI18nProvider>
  );
};

const App = () => {
  const [queryClient] = useState(createFrontendQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAppRoot />
    </QueryClientProvider>
  );
};

export default App;
