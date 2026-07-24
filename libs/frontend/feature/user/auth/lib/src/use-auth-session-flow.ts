import { useEffect, useMemo, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthApiClient, useUserApiClient } from '@app/frontend-api-client';
import { clearApiAuthRequired, getApiErrorDisplayMessage } from '@app/frontend-api-support';
import { useAuthShellStore, type Locale, type UiTheme } from '@app/frontend-runtime';
import {
  fetchUserProfile,
  getPayloadLocale,
  getPayloadTheme,
  getProfileState,
  profileQueryKey,
  type ProfileState,
} from '@app/frontend-feature-user-profile';
import { authMeQueryKey, createAuthSession, fetchAuthMe } from './auth-api';
import { AuthMode } from './auth-model';

export interface AuthSessionFlowMessages {
  authenticationFailed: string;
  unauthenticated: string;
  profileRequestFailed: string;
  profileUnknown: string;
}

export interface AuthSessionFlowInput {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  locale: Locale;
  messages: AuthSessionFlowMessages;
  navigate?: (to: string, options?: { replace?: boolean }) => void;
  returnUrl?: string | null;
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
  navigate,
  returnUrl,
}: AuthSessionFlowInput): AuthSessionFlow {
  const queryClient = useQueryClient();
  const authStore = useAuthShellStore();
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();
  const safeReturnUrl = returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : null;

  const authMeQuery = useQuery({
    queryFn: () => fetchAuthMe(authClient.api, authClient.requestOptions),
    queryKey: [...authMeQueryKey(), locale],
    retry: false,
    staleTime: 15_000,
  });
  const authLocale = getPayloadLocale(authMeQuery.data);
  const authTheme = getPayloadTheme(authMeQuery.data);

  useEffect(() => {
    if (authMeQuery.isLoading) {
      return;
    }
    if (authMeQuery.data) {
      authStore.markAuthenticated();
    } else {
      authStore.clearSession();
    }
  }, [authMeQuery.data, authMeQuery.isLoading, authStore]);

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
    enabled: Boolean(authMeQuery.data) && !authMeQuery.isLoading && (!authLocale || authLocale === locale),
    queryFn: () => fetchUserProfile(userClient.api, userClient.requestOptions),
    queryKey: [...profileQueryKey(), locale],
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
      createAuthSession(authClient.api, authClient.requestOptions, input, locale),
    onMutate: async () => {
      // A fast login can overlap the anonymous session probe. Cancel that
      // probe so its eventual 401 cannot clear the newly established session.
      await queryClient.cancelQueries({ queryKey: authMeQueryKey() });
    },
    onSuccess: (body) => {
      authStore.markAuthenticated();
      clearApiAuthRequired();
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
      if (safeReturnUrl) {
        navigate?.(safeReturnUrl, { replace: true });
      }
    },
    retry: false,
  });

  const profileState = useMemo(() => {
    if (authMutation.isError) {
      return {
        status: 'forbidden' as const,
        reason: getApiErrorDisplayMessage(authMutation.error, messages.authenticationFailed),
      };
    }

    if (!authMeQuery.isLoading && !authMeQuery.data) {
      return {
        status: 'unauthenticated' as const,
        reason: messages.unauthenticated,
      };
    }

    return getProfileState(
      authMeQuery.isLoading || profileQuery.isLoading || Boolean(authLocale && authLocale !== locale),
      profileQuery.data,
      messages.profileRequestFailed,
      messages.profileUnknown,
      profileQuery.error,
    );
  }, [
    authLocale,
    authMeQuery.isLoading,
    authMeQuery.data,
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
      displayName: form.get('displayName'),
      email: form.get('email'),
      mode,
      password: form.get('password'),
    });
  };

  return {
    isLoginPending: authMutation.isPending && authMutation.variables.mode === AuthMode.Login,
    isRegisterPending: authMutation.isPending && authMutation.variables.mode === AuthMode.Register,
    profileState,
    submitAuth,
  };
}
