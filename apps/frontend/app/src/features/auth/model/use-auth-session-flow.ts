import { useEffect, useMemo, type SubmitEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthApiClient, useUserApiClient } from "@app/frontend/api-client";
import { useAuthShellStore, type Locale, type UiTheme } from "@app/frontend/ui";
import {
  fetchUserProfile,
  getPayloadLocale,
  getPayloadTheme,
  getProfileState,
  profileQueryKey,
  type ProfileState,
} from "../../../entities/profile";
import { getErrorReason } from "../../../shared/lib";
import { authMeQueryKey, createAuthSession, fetchAuthMe } from "../api";
import type { AuthMode } from "./auth-model";

export interface AuthSessionFlowMessages {
  authenticationFailed: string;
  missingToken: string;
  profileRequestFailed: string;
  profileUnknown: string;
}

export interface AuthSessionFlowInput {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  locale: Locale;
  messages: AuthSessionFlowMessages;
}

export interface AuthSessionFlow {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  profileState: ProfileState;
  submitAuth: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
}

export function useAuthSessionFlow({
  applyUserLocale,
  applyUserTheme,
  locale,
  messages,
}: AuthSessionFlowInput): AuthSessionFlow {
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();
  const bearerToken = authStore.bearerToken;

  const authMeQuery = useQuery({
    enabled: Boolean(bearerToken),
    queryFn: () => fetchAuthMe(authClient.api, authClient.requestOptions),
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
    queryFn: () => fetchUserProfile(userClient.api, userClient.requestOptions),
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
    mutationFn: (input: Parameters<typeof createAuthSession>[2]) =>
      createAuthSession(
        authClient.api,
        authClient.requestOptions,
        input,
        locale,
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
      void queryClient.invalidateQueries({ queryKey: authMeQueryKey() });
      void queryClient.invalidateQueries({ queryKey: profileQueryKey() });
    },
    retry: false,
  });

  const profileState = useMemo(() => {
    if (authMutation.isError) {
      return {
        status: "forbidden" as const,
        reason: getErrorReason(
          authMutation.error,
          messages.authenticationFailed,
        ),
      };
    }

    if (!bearerToken) {
      return {
        status: "missing-token" as const,
        reason: messages.missingToken,
      };
    }

    return getProfileState(
      authMeQuery.isLoading ||
        profileQuery.isLoading ||
        Boolean(authLocale && authLocale !== locale),
      profileQuery.data,
      messages.profileRequestFailed,
      messages.profileUnknown,
      profileQuery.error,
    );
  }, [
    authLocale,
    authMeQuery.isLoading,
    bearerToken,
    authMutation.error,
    authMutation.isError,
    locale,
    messages,
    profileQuery.data,
    profileQuery.error,
    profileQuery.isLoading,
  ]);

  const submitAuth = (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    authMutation.mutate({
      displayName: form.get("displayName"),
      email: form.get("email"),
      mode,
      password: form.get("password"),
    });
  };

  return {
    isLoginPending:
      authMutation.isPending && authMutation.variables?.mode === "login",
    isRegisterPending:
      authMutation.isPending && authMutation.variables?.mode === "register",
    profileState,
    submitAuth,
  };
}
