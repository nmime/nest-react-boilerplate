import { useCallback, useEffect, useState } from "react";
import { normalizeLocale, type Locale } from "@app/common/i18n";
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

type PrincipalPayload = {
  subject?: string;
  email?: string;
  locale?: string | null;
};

type ProfilePayload = {
  principal?: PrincipalPayload;
  profile?: { email?: string; id?: string; locale?: string | null };
};

type AuthSessionPayload = {
  accessToken?: string;
  principal?: PrincipalPayload;
  user?: { locale?: string | null };
};

type LocalePayload =
  | AuthSessionPayload
  | ProfilePayload
  | { locale?: string | null };

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

const getPayloadLocale = (payload?: LocalePayload): Locale | undefined => {
  const directLocale =
    payload && "locale" in payload ? payload.locale : undefined;
  const userLocale =
    payload && "user" in payload ? payload.user?.locale : undefined;
  const profileLocale =
    payload && "profile" in payload ? payload.profile?.locale : undefined;
  const principalLocale =
    payload && "principal" in payload ? payload.principal?.locale : undefined;

  return normalizeLocale(
    directLocale ?? userLocale ?? profileLocale ?? principalLocale ?? undefined,
  );
};

const bearerHeaders = (token: string, locale: Locale) => ({
  "Accept-Language": locale,
  Authorization: `Bearer ${token}`,
});

async function fetchAuthMe(
  token: string,
  locale: Locale,
): Promise<ProfilePayload | undefined> {
  const response = await fetch(`${authBaseUrl()}/auth/me`, {
    headers: bearerHeaders(token, locale),
  });

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as { data?: ProfilePayload };
  return body.data;
}

export interface UserAppProps {
  token: string;
  setToken: (token: string) => void;
  applyUserLocale: (locale: Locale) => void;
}

const UserApp = ({
  applyUserLocale,
  setToken,
  token,
}: Readonly<UserAppProps>) => {
  const { locale, t } = useI18n();
  const [state, setState] = useState<ProfileState>(
    token ? { status: "loading" } : { status: "missing-token" },
  );

  useEffect(() => {
    if (!token) {
      setState({ status: "missing-token" });
      return undefined;
    }

    let active = true;
    persistToken(token);
    setState({ status: "loading" });

    void (async () => {
      try {
        const authPayload = await fetchAuthMe(token, locale).catch(
          () => undefined,
        );
        const authLocale = getPayloadLocale(authPayload);
        if (active && authLocale) {
          applyUserLocale(authLocale);
          if (authLocale !== locale) {
            return;
          }
        }

        const response = await fetch(`${userBaseUrl()}/profile/me`, {
          headers: bearerHeaders(token, locale),
        });
        if (!response.ok) {
          throw new Error(`Profile request failed with ${response.status}.`);
        }
        const body = (await response.json()) as { data?: ProfilePayload };
        if (!active) {
          return;
        }
        const nextLocale = getPayloadLocale(body.data);
        if (nextLocale) {
          applyUserLocale(nextLocale);
        }
        setState({
          status: "ready",
          subject:
            body.data?.profile?.email ??
            body.data?.principal?.email ??
            body.data?.profile?.id ??
            body.data?.principal?.subject ??
            "unknown",
          email: body.data?.profile?.email ?? body.data?.principal?.email,
        });
      } catch (error) {
        if (active) {
          setState({
            status: "forbidden",
            reason:
              error instanceof Error
                ? error.message
                : "Profile request failed.",
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [applyUserLocale, locale, token]);

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
          locale,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`${mode} failed with ${response.status}.`);
          }
          return (await response.json()) as { data?: AuthSessionPayload };
        })
        .then((body) => {
          const nextLocale = getPayloadLocale(body.data);
          if (nextLocale) {
            applyUserLocale(nextLocale);
          }
          setToken(body.data?.accessToken ?? "");
        })
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

const App = () => {
  const [token, setToken] = useState(readInitialToken);
  const [userLocale, setUserLocale] = useState<Locale | null>(null);

  const applyUserLocale = useCallback((nextLocale: Locale) => {
    setUserLocale(nextLocale);
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      if (!token) {
        return;
      }

      try {
        const response = await fetch(`${authBaseUrl()}/auth/me/locale`, {
          method: "PATCH",
          headers: {
            ...bearerHeaders(token, nextLocale),
            "content-type": "application/json",
          },
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (response.ok) {
          const body = (await response.json()) as {
            data?: AuthSessionPayload | { locale?: string | null };
          };
          setUserLocale(getPayloadLocale(body.data) ?? nextLocale);
        }
      } catch {
        // Locale is still persisted locally; retry on the next explicit change.
      }
    },
    [token],
  );

  return (
    <FrontendI18nProvider
      onLocaleChange={persistUserLocale}
      userLocale={userLocale}
    >
      <UserApp
        applyUserLocale={applyUserLocale}
        setToken={setToken}
        token={token}
      />
    </FrontendI18nProvider>
  );
};

export default App;
