import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthApiClient } from '@app/frontend-api-client';
import { createApiRuntimeFetch } from '@app/frontend-api-support';
import { useAuthShellStore, type Locale, type UiTheme } from '@app/frontend-runtime';
import { getPayloadLocale, getPayloadTheme } from '@app/frontend-feature-user-profile';
import { authMeQueryKey, fetchAuthMe } from './auth-api';

export interface AuthSessionProbeInput {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  locale: Locale;
  redirectOnUnauthenticated?: boolean;
}

export function useAuthSessionProbe({
  applyUserLocale,
  applyUserTheme,
  locale,
  redirectOnUnauthenticated = true,
}: AuthSessionProbeInput) {
  const authStore = useAuthShellStore();
  const authClient = useAuthApiClient();
  const authMeQuery = useQuery({
    queryFn: () =>
      fetchAuthMe(authClient.api, {
        ...authClient.requestOptions,
        fetchImpl: redirectOnUnauthenticated ? authClient.requestOptions.fetchImpl : createApiRuntimeFetch(),
      }),
    queryKey: [...authMeQueryKey(), locale, redirectOnUnauthenticated ? 'auth-required' : 'silent'],
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

  return { authLocale, authMeQuery };
}
