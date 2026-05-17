import {
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import {
  createAuthSession,
  createFrontendQueryClient,
  fetchAuthMe,
  fetchUserProfile,
  getAuthApiBaseUrl,
  getUserApiBaseUrl,
  persistAuthLocale,
  type AuthSessionPayload,
  type LocalePreferencePayload,
  type ProfilePayload,
} from "@app/frontend-api-client";
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

type LocalePayload =
  | AuthSessionPayload
  | ProfilePayload
  | LocalePreferencePayload;
type AuthMode = "login" | "register";
type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

interface AuthMutationInput {
  displayName?: FormDataEntryValue | null;
  email: FormDataEntryValue | null;
  mode: AuthMode;
  password: FormDataEntryValue | null;
}

const TOKEN_KEY = "boilerplate.user.bearerToken";

const getEnvValue = (key: string): string => {
  const env = import.meta.env as Readonly<Record<string, string | undefined>>;
  return env[key]?.trim() ?? "";
};

const authBaseUrl = () =>
  getAuthApiBaseUrl(getEnvValue("VITE_AUTH_API_BASE_URL"));
const userBaseUrl = () =>
  getUserApiBaseUrl(getEnvValue("VITE_USER_API_BASE_URL"));

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

const getProfileSubject = (
  payload?: ProfilePayload,
): { email?: string; subject: string } => ({
  email: payload?.profile?.email ?? payload?.principal?.email,
  subject:
    payload?.profile?.email ??
    payload?.principal?.email ??
    payload?.profile?.id ??
    payload?.principal?.subject ??
    "unknown",
});

const getAuthMutationError = (error: unknown): string =>
  error instanceof Error ? error.message : "Authentication failed.";

const getProfileQueryError = (error: unknown): string =>
  error instanceof Error ? error.message : "Profile request failed.";

const createAuthMutationInput = (
  form: FormData,
  mode: AuthMode,
): AuthMutationInput => ({
  displayName: form.get("displayName") || undefined,
  email: form.get("email"),
  mode,
  password: form.get("password"),
});

const resolveProfileState = ({
  authError,
  authLocale,
  locale,
  profileError,
  profilePayload,
  profilePending,
  token,
}: {
  authError?: unknown;
  authLocale?: Locale;
  locale: Locale;
  profileError?: unknown;
  profilePayload?: ProfilePayload;
  profilePending: boolean;
  token: string;
}): ProfileState => {
  if (authError) {
    return {
      status: "forbidden",
      reason: getAuthMutationError(authError),
    };
  }

  if (!token) {
    return { status: "missing-token" };
  }

  if (profilePending || (Boolean(authLocale) && authLocale !== locale)) {
    return { status: "loading" };
  }

  if (profileError) {
    return {
      status: "forbidden",
      reason: getProfileQueryError(profileError),
    };
  }

  return {
    status: "ready",
    ...getProfileSubject(profilePayload),
  };
};

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
  const authMutation = useMutation({
    mutationFn: ({ displayName, email, mode, password }: AuthMutationInput) =>
      createAuthSession(
        mode,
        {
          displayName,
          email,
          locale,
          password,
        },
        authBaseUrl(),
      ),
    onSuccess: (payload) => {
      const nextLocale = getPayloadLocale(payload);
      if (nextLocale) {
        applyUserLocale(nextLocale);
      }
      setToken(payload?.accessToken ?? "");
    },
  });

  const authMeQuery = useQuery({
    enabled: Boolean(token),
    queryFn: () => fetchAuthMe(token, locale, authBaseUrl()),
    queryKey: ["auth-me", token, locale],
  });
  const authLocale = getPayloadLocale(authMeQuery.data);

  useEffect(() => {
    if (token) {
      persistToken(token);
    }
  }, [token]);

  useEffect(() => {
    if (authLocale && authLocale !== locale) {
      applyUserLocale(authLocale);
    }
  }, [applyUserLocale, authLocale, locale]);

  const profileQuery = useQuery({
    enabled:
      Boolean(token) &&
      authMeQuery.isSuccess &&
      (!authLocale || authLocale === locale),
    queryFn: () => fetchUserProfile(token, locale, userBaseUrl()),
    queryKey: ["user-profile", token, locale],
  });

  useEffect(() => {
    const nextLocale = getPayloadLocale(profileQuery.data);
    if (nextLocale && nextLocale !== locale) {
      applyUserLocale(nextLocale);
    }
  }, [applyUserLocale, locale, profileQuery.data]);

  const state = resolveProfileState({
    authError: authMutation.isError ? authMutation.error : undefined,
    authLocale,
    locale,
    profileError: profileQuery.isError ? profileQuery.error : undefined,
    profilePayload: profileQuery.data,
    profilePending: authMeQuery.isPending || profileQuery.isPending,
    token,
  });

  const submitAuth = (mode: AuthMode) => {
    return (event: {
      preventDefault: () => void;
      currentTarget: HTMLFormElement;
    }) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      authMutation.mutate(createAuthMutationInput(form, mode));
    };
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

const UserAppRoot = () => {
  const [token, setToken] = useState(readInitialToken);
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const localeMutation = useMutation({
    mutationFn: (nextLocale: Locale) => {
      if (!token) {
        return Promise.resolve(undefined);
      }

      return persistAuthLocale(token, nextLocale, authBaseUrl());
    },
    onSuccess: (payload, nextLocale) => {
      setUserLocale(getPayloadLocale(payload) ?? nextLocale);
    },
  });

  const applyUserLocale = useCallback((nextLocale: Locale) => {
    setUserLocale(nextLocale);
  }, []);

  return (
    <FrontendI18nProvider
      onLocaleChange={(nextLocale) => {
        localeMutation.mutate(nextLocale);
      }}
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

const App = () => {
  const [queryClient] = useState(createFrontendQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <UserAppRoot />
    </QueryClientProvider>
  );
};

export default App;
