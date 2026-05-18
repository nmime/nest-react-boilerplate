import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { observer } from "mobx-react-lite";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import { authApi, userApi } from "@app/api-client";
import {
  FrontendI18nProvider,
  FrontendQueryProvider,
  FrontendStateProvider,
  ProductShell,
  UiCard,
  UiSection,
  UiStatCard,
  useAuthShellStore,
  useI18n,
} from "@app/frontend-ui";

type ProfileState =
  | { status: "missing-token" }
  | { status: "loading" }
  | { status: "ready"; email?: string; subject: string }
  | { status: "forbidden"; reason: string };

type AuthMePayload = authApi.AuthControllerMe200["data"];
type AuthSessionPayload = authApi.AuthControllerLogin200["data"];
type AuthLocalePayload = authApi.AuthControllerUpdateLocale200["data"];
type UserProfilePayload = userApi.ProfileControllerMe200["data"];
type LocalePayload =
  | AuthLocalePayload
  | AuthMePayload
  | AuthSessionPayload
  | UserProfilePayload
  | undefined;

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

async function fetchAuthMe(token: string): Promise<AuthMePayload | undefined> {
  try {
    const body = await authApi.authControllerMe({
      authToken: token,
      baseUrl: authBaseUrl(),
    });
    return body.data;
  } catch {
    return undefined;
  }
}

async function fetchUserProfile(token: string): Promise<UserProfilePayload> {
  const body = await userApi.profileControllerMe({
    authToken: token,
    baseUrl: userBaseUrl(),
  });
  return body.data;
}

export interface UserAppProps {
  token: string;
  setToken: (token: string) => void;
  applyUserLocale: (locale: Locale) => void;
}

const getErrorReason = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const formValueToString = (
  value: FormDataEntryValue | null | undefined,
): string => (typeof value === "string" ? value : "");

const getProfileState = (
  token: string,
  loading: boolean,
  profile: UserProfilePayload | undefined,
  profileRequestFailedMessage: string,
  profileUnknownMessage: string,
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
      reason: getErrorReason(error, profileRequestFailedMessage),
    };
  }

  return {
    status: "ready",
    subject:
      profile?.profile?.email ??
      profile?.principal?.email ??
      profile?.profile?.id ??
      profile?.principal?.subject ??
      profileUnknownMessage,
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
    queryKey: [...authApi.getAuthControllerMeQueryKey(), token, locale],
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
    queryKey: [...userApi.getProfileControllerMeQueryKey(), token, locale],
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
      mode === "login"
        ? authApi.authControllerLogin(
            {
              email: formValueToString(email),
              password: formValueToString(password),
            },
            { baseUrl: authBaseUrl() },
          )
        : authApi.authControllerRegister(
            {
              displayName: formValueToString(displayName) || undefined,
              email: formValueToString(email),
              locale,
              password: formValueToString(password),
            },
            { baseUrl: authBaseUrl() },
          ),
    onSuccess: (body) => {
      const nextLocale = getPayloadLocale(body?.data);
      if (nextLocale) {
        applyUserLocale(nextLocale);
      }
      const nextToken = body?.data?.accessToken ?? "";
      setToken(nextToken);
      void queryClient.invalidateQueries({
        queryKey: authApi.getAuthControllerMeQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: userApi.getProfileControllerMeQueryKey(),
      });
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
              t("user.error.authenticationFailed"),
            ),
          }
        : getProfileState(
            token,
            Boolean(token) &&
              (authMeQuery.isLoading ||
                profileQuery.isLoading ||
                Boolean(authLocale && authLocale !== locale)),
            profileQuery.data,
            t("user.error.profileRequestFailed"),
            t("user.profile.unknown"),
            profileQuery.error,
          ),
    [
      authLocale,
      authMeQuery.isLoading,
      authMutation.error,
      authMutation.isError,
      locale,
      t,
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
      <UiSection eyebrow={t("user.auth.eyebrow")} title={t("user.auth.title")}>
        <div className="xr-card-grid" id="auth">
          <UiCard title={t("user.login.title")}>
            <form onSubmit={submitAuth("login")}>
              <input
                aria-label={t("user.form.loginEmailLabel")}
                name="email"
                placeholder={t("user.form.emailPlaceholder")}
              />
              <input
                aria-label={t("user.form.loginPasswordLabel")}
                name="password"
                placeholder={t("user.form.loginPasswordPlaceholder")}
                type="password"
              />
              <button type="submit">{t("user.form.login")}</button>
            </form>
          </UiCard>
          <UiCard title={t("user.register.title")}>
            <form onSubmit={submitAuth("register")}>
              <input
                aria-label={t("user.form.registerDisplayNameLabel")}
                name="displayName"
                placeholder={t("user.form.displayName")}
              />
              <input
                aria-label={t("user.form.registerEmailLabel")}
                name="email"
                placeholder={t("user.form.registerEmailPlaceholder")}
              />
              <input
                aria-label={t("user.form.registerPasswordLabel")}
                name="password"
                placeholder={t("user.form.registerPasswordPlaceholder")}
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
          <UiStatCard
            detail={t("user.stat.authApi.detail")}
            label={t("user.stat.authApi.label")}
            value="3003"
          />
          <UiStatCard
            detail={t("user.stat.userApi.detail")}
            label={t("user.stat.userApi.label")}
            value="3002"
          />
        </div>
      </UiSection>
    </ProductShell>
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
      authApi.authControllerUpdateLocale(
        { locale: nextLocale },
        { authToken: token, baseUrl: authBaseUrl() },
      ),
    onSuccess: (body, nextLocale) => {
      setUserLocale(getPayloadLocale(body?.data) ?? nextLocale);
      void queryClient.invalidateQueries({
        queryKey: authApi.getAuthControllerMeQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: userApi.getProfileControllerMeQueryKey(),
      });
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
});

const App = () => (
  <FrontendStateProvider initialBearerToken={readInitialToken()}>
    <FrontendQueryProvider>
      <AppContent />
    </FrontendQueryProvider>
  </FrontendStateProvider>
);

export default App;
