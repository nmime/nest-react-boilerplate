import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import {
  apiFetch,
  FrontendI18nProvider,
  FrontendQueryProvider,
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

type ApiEnvelope<T> = { data?: T };

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

async function fetchAuthMe(
  token: string,
): Promise<ProfilePayload | AuthSessionPayload | undefined> {
  try {
    const body = await apiFetch<
      ApiEnvelope<ProfilePayload | AuthSessionPayload>
    >("/auth/me", { authToken: token, baseUrl: authBaseUrl() });
    return body.data;
  } catch {
    return undefined;
  }
}

async function fetchUserProfile(token: string): Promise<ProfilePayload> {
  const body = await apiFetch<ApiEnvelope<ProfilePayload>>("/profile/me", {
    authToken: token,
    baseUrl: userBaseUrl(),
  });
  return body.data ?? {};
}

export interface UserAppProps {
  token: string;
  setToken: (token: string) => void;
  applyUserLocale: (locale: Locale) => void;
}

const getErrorReason = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const getProfileState = (
  token: string,
  loading: boolean,
  profile?: ProfilePayload,
  error?: unknown,
): ProfileState => {
  if (!token) {
    return { status: "missing-token" };
  }
  if (loading) {
    return { status: "loading" };
  }
  if (error) {
    return {
      status: "forbidden",
      reason: getErrorReason(error, "Profile request failed."),
    };
  }

  return {
    status: "ready",
    subject:
      profile?.profile?.email ??
      profile?.principal?.email ??
      profile?.profile?.id ??
      profile?.principal?.subject ??
      "unknown",
    email: profile?.profile?.email ?? profile?.principal?.email,
  };
};

const UserApp = ({
  applyUserLocale,
  setToken,
  token,
}: Readonly<UserAppProps>) => {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (token) {
      persistToken(token);
    }
  }, [token]);

  const authMeQuery = useQuery({
    enabled: Boolean(token),
    queryFn: () => fetchAuthMe(token),
    queryKey: ["auth", "me", token, locale],
    retry: false,
    staleTime: 15_000,
  });
  const authLocale = getPayloadLocale(authMeQuery.data);

  useEffect(() => {
    if (authLocale) {
      applyUserLocale(authLocale);
    }
  }, [applyUserLocale, authLocale]);

  const profileQuery = useQuery({
    enabled:
      Boolean(token) &&
      !authMeQuery.isLoading &&
      (!authLocale || authLocale === locale),
    queryFn: () => fetchUserProfile(token),
    queryKey: ["user", "profile", "me", token, locale],
    retry: false,
    staleTime: 15_000,
  });
  const profileLocale = getPayloadLocale(profileQuery.data);

  useEffect(() => {
    if (profileLocale) {
      applyUserLocale(profileLocale);
    }
  }, [applyUserLocale, profileLocale]);

  const authMutation = useMutation({
    mutationFn: async ({
      displayName,
      email,
      mode,
      password,
    }: {
      displayName?: FormDataEntryValue | null;
      email: FormDataEntryValue | null;
      mode: "login" | "register";
      password: FormDataEntryValue | null;
    }) =>
      apiFetch<ApiEnvelope<AuthSessionPayload>>(`/auth/${mode}`, {
        baseUrl: authBaseUrl(),
        json: {
          displayName: displayName || undefined,
          email,
          locale,
          password,
        },
        method: "POST",
      }),
    onSuccess: (body) => {
      const nextLocale = getPayloadLocale(body?.data);
      if (nextLocale) {
        applyUserLocale(nextLocale);
      }
      const nextToken = body?.data?.accessToken ?? "";
      setToken(nextToken);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
    },
    retry: false,
  });

  const state = useMemo(
    () =>
      authMutation.isError
        ? {
            status: "forbidden" as const,
            reason: getErrorReason(
              authMutation.error,
              "Authentication failed.",
            ),
          }
        : getProfileState(
            token,
            Boolean(token) &&
              (authMeQuery.isLoading ||
                profileQuery.isLoading ||
                Boolean(authLocale && authLocale !== locale)),
            profileQuery.data,
            profileQuery.error,
          ),
    [
      authLocale,
      authMeQuery.isLoading,
      authMutation.error,
      authMutation.isError,
      locale,
      profileQuery.data,
      profileQuery.error,
      profileQuery.isLoading,
      token,
    ],
  );

  const submitAuth =
    (mode: "login" | "register") =>
    (event: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      authMutation.mutate({
        displayName: form.get("displayName"),
        email: form.get("email"),
        mode,
        password: form.get("password"),
      });
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

const AppContent = () => {
  const [token, setToken] = useState(readInitialToken);
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const queryClient = useQueryClient();

  const localeMutation = useMutation({
    mutationFn: (nextLocale: Locale) =>
      apiFetch<ApiEnvelope<AuthSessionPayload | { locale?: string | null }>>(
        "/auth/me/locale",
        {
          authToken: token,
          baseUrl: authBaseUrl(),
          json: { locale: nextLocale },
          method: "PATCH",
        },
      ),
    onSuccess: (body, nextLocale) => {
      setUserLocale(getPayloadLocale(body?.data) ?? nextLocale);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
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
        // Locale is still persisted locally; retry on the next explicit change.
      }
    },
    [localeMutation, token],
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

const App = () => (
  <FrontendQueryProvider>
    <AppContent />
  </FrontendQueryProvider>
);

export default App;
