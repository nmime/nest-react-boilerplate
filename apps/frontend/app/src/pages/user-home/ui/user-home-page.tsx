import type { FormEvent } from "react";
import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale } from "@app/common/i18n";
import { useAuthShellStore, useI18n, type UiTheme } from "@app/frontend-ui";
import { getErrorReason } from "../../../shared/lib";
import { ProductShell } from "../../../shared/ui";
import {
  getPayloadLocale,
  getPayloadTheme,
  getProfileState,
} from "../../../entities/profile";
import {
  fetchUserProfile,
  profileQueryKey,
} from "../../../entities/profile/api";
import {
  authMeQueryKey,
  createAuthSession,
  fetchAuthMe,
  type AuthMode,
} from "../../../features/auth";
import { AuthPanel } from "../../../widgets/auth-panel";
import { ProfileStatusCard } from "../../../widgets/profile-status";

export interface UserHomePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

export const UserHomePage = observer(function UserHomePage({
  applyUserLocale,
  applyUserTheme,
}: Readonly<UserHomePageProps>) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const bearerToken = authStore.bearerToken;
  const bearerTokenForRequest = bearerToken ?? "";

  const authMeQuery = useQuery({
    enabled: Boolean(bearerToken),
    queryFn: () => fetchAuthMe(bearerTokenForRequest),
    queryKey: [...authMeQueryKey(), locale, bearerToken],
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
    queryFn: () => fetchUserProfile(bearerTokenForRequest),
    queryKey: [...profileQueryKey(), locale, bearerToken],
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
    mutationFn: (input: Parameters<typeof createAuthSession>[0]) =>
      createAuthSession(input, locale),
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
      void queryClient.invalidateQueries({ queryKey: authMeQueryKey() });
      void queryClient.invalidateQueries({ queryKey: profileQueryKey() });
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

  const submitAuth = (mode: AuthMode, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    authMutation.mutate({
      displayName: form.get("displayName"),
      email: form.get("email"),
      mode,
      password: form.get("password"),
    });
  };

  const loginPending =
    authMutation.isPending && authMutation.variables?.mode === "login";
  const registerPending =
    authMutation.isPending && authMutation.variables?.mode === "register";

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
      <AuthPanel
        isLoginPending={loginPending}
        isRegisterPending={registerPending}
        loadingLabel={t("user.loadingProfile")}
        onAuthSubmit={submitAuth}
        t={t}
      >
        <ProfileStatusCard state={state} t={t} />
      </AuthPanel>
    </ProductShell>
  );
});
