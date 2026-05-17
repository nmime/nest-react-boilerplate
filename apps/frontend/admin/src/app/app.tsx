import { useCallback, useEffect, useState } from "react";
import { normalizeLocale } from "@app/common/i18n";
import { FrontendI18nProvider, useI18n } from "@app/frontend-ui";
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

const bearerHeaders = (token: string, locale: string) => ({
  "Accept-Language": locale,
  Authorization: `Bearer ${token}`,
});

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
  const [state, setState] = useState<AdminProfileState>(
    token ? { status: "loading" } : { status: "missing-token" },
  );

  useEffect(() => {
    if (!token) {
      setState({ status: "missing-token" });
      return undefined;
    }

    let active = true;
    setState({ status: "loading" });
    void fetchAdminProfile(fetch, token, getConfiguredAdminApiBaseUrl(), locale)
      .then((payload) => {
        /* v8 ignore next 3 -- defensive cleanup path for unmounted components */
        if (!active) {
          return;
        }
        const nextLocale = normalizeLocale(
          payload.profile?.locale ?? payload.principal?.locale,
        );
        if (nextLocale) {
          applyUserLocale(nextLocale);
          if (nextLocale !== locale) {
            return;
          }
        }
        const access = createAdminAccess(payload.principal);
        setState(
          access.isAuthenticated
            ? { status: "ready", payload, access }
            : {
                status: "forbidden",
                reason: t("errors.auth.principalMissing"),
              },
        );
      })
      .catch((error: unknown) => {
        /* v8 ignore next 1 -- rejected after unmount is a defensive no-op */
        if (active) {
          setState({
            status: "forbidden",
            reason:
              error instanceof Error
                ? error.message
                : "Profile request failed.",
          });
        }
      });

    return () => {
      /* v8 ignore next -- cleanup assignment has no user-visible branch */
      active = false;
    };
  }, [applyUserLocale, locale, t, token]);

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

const App = () => {
  const [token, setToken] = useState(() =>
    resolveInitialBearerToken(getBrowserHref(), getBrowserStorage()),
  );
  const [userLocale, setUserLocale] = useState<"en" | "es" | null>(null);

  const applyUserLocale = useCallback((nextLocale: "en" | "es") => {
    setUserLocale(nextLocale);
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: "en" | "es") => {
      if (!token) {
        return;
      }

      try {
        const response = await fetch(
          `${getConfiguredAuthApiBaseUrl()}/auth/me/locale`,
          {
            method: "PATCH",
            headers: {
              ...bearerHeaders(token, nextLocale),
              "content-type": "application/json",
            },
            body: JSON.stringify({ locale: nextLocale }),
          },
        );
        if (response.ok) {
          const body = (await response.json()) as {
            data?: {
              locale?: string | null;
              user?: { locale?: string | null };
            };
          };
          const persistedLocale = normalizeLocale(
            body.data?.locale ?? body.data?.user?.locale,
          );
          setUserLocale(persistedLocale ?? nextLocale);
        }
      } catch {
        // Locale remains persisted locally and can be retried on the next switch.
      }
    },
    [token],
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
};

export default App;
