import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeLocale, type Locale } from "@app/common/i18n";
import { authApi, throwOnOpenApiErrorData, userApi } from "@app/api-client";
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
  type UiTheme,
} from "@app/frontend-ui";

type ProfileState =
  | { status: "loading" }
  | { status: "missing-token"; reason: string }
  | { status: "ready"; email?: string; subject: string }
  | { status: "forbidden"; reason: string };

type AuthMePayload = authApi.AuthControllerMeData;
type AuthSessionPayload = authApi.AuthControllerLoginData;
type AuthPreferencesPayload = authApi.AuthControllerUpdatePreferencesData;
type UserProfilePayload = userApi.ProfileControllerMeData;
type LocalePayload =
  | AuthPreferencesPayload
  | AuthMePayload
  | AuthSessionPayload
  | UserProfilePayload
  | undefined;

const getEnvValue = (key: string): string => {
  const env = import.meta.env as Readonly<Record<string, string | undefined>>;
  return env[key]?.trim() ?? "";
};

const authBaseUrl = () =>
  getEnvValue("VITE_AUTH_API_BASE_URL").replace(/\/$/u, "");
const userBaseUrl = () =>
  getEnvValue("VITE_USER_API_BASE_URL").replace(/\/$/u, "");

const readInitialBearerToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const search = new URL(window.location.href).searchParams;
  return (
    search.get("token")?.trim() ||
    search.get("admin" + "_token")?.trim() ||
    null
  );
};

const scrubLegacyAuthTokenParams = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ["token", "admin" + "_token"]) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }

  if (changed) {
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }
};

const normalizeTheme = (value: unknown): UiTheme | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "system" ||
    normalized === "light" ||
    normalized === "dark"
    ? normalized
    : undefined;
};

const readTheme = (value: unknown): UiTheme | undefined =>
  normalizeTheme(
    value && typeof value === "object"
      ? (value as Record<string, unknown>)["theme"]
      : undefined,
  );

const getPayloadLocale = (
  payload?: LocalePayload | null,
): Locale | undefined => {
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

const getPayloadTheme = (
  payload?: LocalePayload | null,
): UiTheme | undefined => {
  return (
    readTheme(payload) ??
    (payload && "user" in payload ? readTheme(payload.user) : undefined) ??
    (payload && "profile" in payload
      ? readTheme(payload.profile)
      : undefined) ??
    (payload && "principal" in payload
      ? readTheme(payload.principal)
      : undefined)
  );
};

async function fetchAuthMe(authToken: string): Promise<AuthMePayload | null> {
  try {
    const result = await authApi.authControllerMe({
      authToken,
      baseUrl: authBaseUrl(),
    });
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchUserProfile(
  authToken: string,
): Promise<UserProfilePayload> {
  return throwOnOpenApiErrorData(
    userApi.profileControllerMe({
      authToken,
      baseUrl: userBaseUrl(),
    }),
  );
}

export interface UserAppProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

const getErrorReason = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record["detail"] ?? record["message"] ?? record["title"];
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
};

const formValueToString = (
  value: FormDataEntryValue | null | undefined,
): string => (typeof value === "string" ? value : "");

const getProfileState = (
  loading: boolean,
  profile: UserProfilePayload | undefined,
  profileRequestFailedMessage: string,
  profileUnknownMessage: string,
  error?: unknown,
): ProfileState => {
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

const UserApp = observer(function UserApp({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserAppProps>) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const bearerToken = authStore.bearerToken;

  const authMeQuery = useQuery({
    enabled: Boolean(bearerToken),
    queryFn: () => fetchAuthMe(bearerToken ?? ""),
    queryKey: [...authApi.getAuthControllerMeQueryKey(), locale, bearerToken],
    retry: false,
    staleTime: 15_000,
  });
  const authLocale = getPayloadLocale(authMeQuery.data);
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
    enabled:
      Boolean(bearerToken) &&
      !authMeQuery.isLoading &&
      (!authLocale || authLocale === locale),
    queryFn: () => fetchUserProfile(bearerToken ?? ""),
    queryKey: [
      ...userApi.getProfileControllerMeQueryKey(),
      locale,
      bearerToken,
    ],
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
        ? throwOnOpenApiErrorData(
            authApi.authControllerLogin(
              {
                email: formValueToString(email),
                password: formValueToString(password),
              },
              { baseUrl: authBaseUrl() },
            ),
          )
        : throwOnOpenApiErrorData(
            authApi.authControllerRegister(
              {
                displayName: formValueToString(displayName) || undefined,
                email: formValueToString(email),
                locale,
                password: formValueToString(password),
              },
              { baseUrl: authBaseUrl() },
            ),
          ),
    onSuccess: (body) => {
      authStore.setBearerToken(body?.accessToken);
      const nextLocale = getPayloadLocale(body);
      const nextTheme = getPayloadTheme(body);
      if (nextLocale) {
        applyUserLocale(nextLocale);
      }
      if (nextTheme) {
        applyUserTheme(nextTheme);
      }
      void queryClient.invalidateQueries({
        queryKey: authApi.getAuthControllerMeQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: userApi.getProfileControllerMeQueryKey(),
      });
    },
    retry: false,
  });

  const state = useMemo(() => {
    if (authMutation.isError) {
      return {
        status: "forbidden" as const,
        reason: getErrorReason(
          authMutation.error,
          t("user.error.authenticationFailed"),
        ),
      };
    }

    if (!bearerToken) {
      return {
        status: "missing-token" as const,
        reason: t("user.state.missingToken"),
      };
    }

    return getProfileState(
      authMeQuery.isLoading ||
        profileQuery.isLoading ||
        Boolean(authLocale && authLocale !== locale),
      profileQuery.data,
      t("user.error.profileRequestFailed"),
      t("user.profile.unknown"),
      profileQuery.error,
    );
  }, [
    authLocale,
    authMeQuery.isLoading,
    bearerToken,
    authMutation.error,
    authMutation.isError,
    locale,
    t,
    profileQuery.data,
    profileQuery.error,
    profileQuery.isLoading,
  ]);

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
                autoComplete="email"
                name="email"
                placeholder={t("user.form.emailPlaceholder")}
                required
                type="email"
              />
              <input
                aria-label={t("user.form.loginPasswordLabel")}
                autoComplete="current-password"
                minLength={8}
                name="password"
                placeholder={t("user.form.loginPasswordPlaceholder")}
                required
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
                autoComplete="email"
                name="email"
                placeholder={t("user.form.registerEmailPlaceholder")}
                required
                type="email"
              />
              <input
                aria-label={t("user.form.registerPasswordLabel")}
                autoComplete="new-password"
                minLength={8}
                name="password"
                placeholder={t("user.form.registerPasswordPlaceholder")}
                required
                type="password"
              />
              <button type="submit">{t("user.form.register")}</button>
            </form>
          </UiCard>
          <UiCard title={t("user.profile.title")} id="profile">
            {state.status === "loading" && t("user.loadingProfile")}
            {state.status === "ready" &&
              t("user.state.ready", { subject: state.email ?? state.subject })}
            {state.status === "missing-token" && state.reason}
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
});

const AppContent = observer(function AppContent() {
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const bearerToken = authStore.bearerToken;

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: { locale?: Locale; theme?: UiTheme }) =>
      throwOnOpenApiErrorData(
        authApi.authControllerUpdatePreferences(nextPreferences, {
          authToken: bearerToken,
          baseUrl: authBaseUrl(),
        }),
      ),
    onSuccess: (body, nextPreferences) => {
      setUserLocale(
        getPayloadLocale(body) ?? nextPreferences.locale ?? userLocale ?? null,
      );
      setUserTheme(
        getPayloadTheme(body) ?? nextPreferences.theme ?? userTheme ?? null,
      );
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
  const applyUserTheme = useCallback((nextTheme: UiTheme) => {
    setUserTheme(nextTheme);
  }, []);

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      try {
        await preferencesMutation.mutateAsync({ locale: nextLocale });
      } catch {
        // Locale is still persisted locally; retry on the next explicit change.
      }
    },
    [preferencesMutation],
  );
  const persistUserTheme = useCallback(
    async (nextTheme: UiTheme) => {
      try {
        await preferencesMutation.mutateAsync({ theme: nextTheme });
      } catch {
        // Theme is still persisted locally; retry on the next explicit change.
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
      <UserApp
        applyUserLocale={applyUserLocale}
        applyUserTheme={applyUserTheme}
      />
    </FrontendI18nProvider>
  );
});

const App = () => {
  const [initialBearerToken] = useState(readInitialBearerToken);

  useEffect(() => {
    scrubLegacyAuthTokenParams();
  }, []);

  return (
    <FrontendStateProvider initialBearerToken={initialBearerToken}>
      <FrontendQueryProvider>
        <AppContent />
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
};

export default App;
