import { useEffect, useState } from "react";
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

const App = () => {
  const [path] = useState(getBrowserPath);
  const [token, setToken] = useState(() =>
    resolveInitialBearerToken(getBrowserHref(), getBrowserStorage()),
  );
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
    void fetchAdminProfile(fetch, token, getConfiguredAdminApiBaseUrl())
      .then((payload) => {
        /* v8 ignore next 3 -- defensive cleanup path for unmounted components */
        if (!active) {
          return;
        }
        const access = createAdminAccess(payload.principal);
        setState(
          access.isAuthenticated
            ? { status: "ready", payload, access }
            : {
                status: "forbidden",
                reason: "Authenticated principal is missing.",
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
  }, [token]);

  return (
    <AdminLayout>
      <DevTokenForm
        onSubmit={(nextToken) => {
          saveBearerToken(getBrowserStorage(), nextToken);
          setToken(nextToken.trim());
        }}
      />
      {renderAdminRoute(path, state)}
    </AdminLayout>
  );
};

export default App;
