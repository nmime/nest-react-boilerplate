import { useEffect, useState } from "react";
import {
  FrontendI18nProvider,
  ProductShell,
  UiCard,
  UiSection,
  UiStatCard,
  useI18n,
} from "@app/frontend-ui";

type ProfileState =
  | { status: "missing-token" }
  | { status: "loading" }
  | { status: "ready"; email?: string; subject: string }
  | { status: "forbidden"; reason: string };

const TOKEN_KEY = "boilerplate.user.bearerToken";
const getEnvValue = (key: string): string => {
  const env = import.meta.env as Readonly<Record<string, string | undefined>>;
  return env[key]?.trim() ?? "";
};

const authBaseUrl = () =>
  getEnvValue("VITE_AUTH_API_BASE_URL").replace(/\/$/u, "");
const userBaseUrl = () =>
  getEnvValue("VITE_USER_API_BASE_URL").replace(/\/$/u, "");

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

const getBrowserStorage = (): BrowserStorage | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readTokenFromUrl = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return new URL(window.location.href).searchParams.get("token") ?? "";
};

const readInitialToken = () =>
  (readTokenFromUrl() || getBrowserStorage()?.getItem(TOKEN_KEY) || "").trim();

const persistToken = (token: string): void => {
  getBrowserStorage()?.setItem(TOKEN_KEY, token);
};

const UserApp = () => {
  const { locale, t } = useI18n();
  const [token, setToken] = useState(readInitialToken);
  const [state, setState] = useState<ProfileState>(
    token ? { status: "loading" } : { status: "missing-token" },
  );

  useEffect(() => {
    if (!token) {
      setState({ status: "missing-token" });
      return;
    }
    persistToken(token);
    setState({ status: "loading" });
    void fetch(`${userBaseUrl()}/profile/me`, {
      headers: { "Accept-Language": locale, Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Profile request failed with ${response.status}.`);
        }
        return (await response.json()) as {
          data?: { principal?: { subject?: string; email?: string } };
        };
      })
      .then((body) =>
        setState({
          status: "ready",
          subject: body.data?.principal?.subject ?? "unknown",
          email: body.data?.principal?.email,
        }),
      )
      .catch((error: unknown) =>
        setState({
          status: "forbidden",
          reason:
            error instanceof Error ? error.message : "Profile request failed.",
        }),
      );
  }, [locale, token]);

  const submitAuth =
    (mode: "login" | "register") =>
    (event: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void fetch(`${authBaseUrl()}/auth/${mode}`, {
        method: "POST",
        headers: {
          "Accept-Language": locale,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          displayName: form.get("displayName") || undefined,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`${mode} failed with ${response.status}.`);
          }
          return (await response.json()) as { data?: { accessToken?: string } };
        })
        .then((body) => setToken(body.data?.accessToken ?? ""))
        .catch((error: unknown) =>
          setState({
            status: "forbidden",
            reason:
              error instanceof Error ? error.message : "Authentication failed.",
          }),
        );
    };

  return (
    <ProductShell
      actions={[
        { href: "#auth", label: t("user.form.login") },
        {
          href: "#profile",
          label: t("user.action.profile"),
          variant: "secondary",
        },
      ]}
      appName={t("user.appName")}
      description={t("user.description")}
      eyebrow={t("user.eyebrow")}
      status={t("user.status")}
      statusTone="success"
      title={t("user.title")}
    >
      <UiSection
        eyebrow="Authentication"
        title="Development login/register flow"
      >
        <div className="xr-card-grid" id="auth">
          <UiCard title={t("user.login.title")}>
            <form onSubmit={submitAuth("login")}>
              <input
                aria-label="Login email"
                name="email"
                placeholder="user@example.com"
              />
              <input
                aria-label="Login password"
                name="password"
                placeholder="password"
                type="password"
              />
              <button type="submit">{t("user.form.login")}</button>
            </form>
          </UiCard>
          <UiCard title={t("user.register.title")}>
            <form onSubmit={submitAuth("register")}>
              <input
                aria-label="Register display name"
                name="displayName"
                placeholder={t("user.form.displayName")}
              />
              <input
                aria-label="Register email"
                name="email"
                placeholder="new@example.com"
              />
              <input
                aria-label="Register password"
                name="password"
                placeholder="minimum 8 characters"
                type="password"
              />
              <button type="submit">{t("user.form.register")}</button>
            </form>
          </UiCard>
          <UiCard title={t("user.profile.title")} id="profile">
            {state.status === "missing-token" && t("user.state.missingToken")}
            {state.status === "loading" && t("user.loadingProfile")}
            {state.status === "ready" &&
              t("user.state.ready", { subject: state.email ?? state.subject })}
            {state.status === "forbidden" &&
              t("user.state.forbidden", { reason: state.reason })}
          </UiCard>
        </div>
        <div className="xr-stat-grid">
          <UiStatCard detail="auth-app-api" label="Auth API" value="3003" />
          <UiStatCard detail="user-app-api" label="User API" value="3002" />
        </div>
      </UiSection>
    </ProductShell>
  );
};

const App = () => (
  <FrontendI18nProvider>
    <UserApp />
  </FrontendI18nProvider>
);

export default App;
