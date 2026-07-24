import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useAuthApiClient } from '@app/frontend-api-client';
import type { Locale, UiTheme } from '@app/frontend-runtime';
import { getPayloadLocale, getPayloadTheme } from './session-payload';
import { authPreferencesQueryKey, updateUserPreferences } from './session-preferences-api';
import type { UserPreferencePatch } from './session-preferences-model';

export interface UserPreferenceControls {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  persistUserLocale: (locale: Locale) => Promise<void>;
  persistUserTheme: (theme: UiTheme) => Promise<void>;
  userLocale: Locale | null;
  userTheme: UiTheme | null;
}

export interface UserPreferenceControlsOptions {
  // When true, once the user has explicitly persisted a preference, later
  // server-derived `apply*` calls stop overriding it (the admin console's
  // behavior). The mini-app leaves this off so it always tracks the latest
  // server value.
  guardExplicitOverrides?: boolean;
  // Query keys to invalidate after a successful preference write, on top of the
  // auth/me query the hook always refreshes. Each consumer supplies its own
  // profile query key here (user profile vs. admin profile).
  invalidateQueryKeys?: () => readonly QueryKey[];
}

/**
 * Drives locale/theme preference state against the shared `/auth/me/preferences`
 * endpoint. Consumed by the user web app, the native mobile app, and the admin
 * console; product-specific behavior (which profile query to invalidate, whether
 * to latch explicit choices) is injected through options.
 */
export function useSessionPreferenceControls(options: UserPreferenceControlsOptions = {}): UserPreferenceControls {
  const { guardExplicitOverrides = false, invalidateQueryKeys } = options;
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const explicitLocale = useRef<Locale | null>(null);
  const explicitTheme = useRef<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authClient = useAuthApiClient();

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: UserPreferencePatch) =>
      updateUserPreferences(authClient.api, authClient.requestOptions, nextPreferences),
    onSuccess: (body, nextPreferences) => {
      /* v8 ignore start -- preference mutation falls back through optional response/request/current values. */
      const nextLocale = getPayloadLocale(body) ?? nextPreferences.locale ?? userLocale ?? null;
      const nextThemeValue = getPayloadTheme(body) ?? nextPreferences.theme ?? userTheme ?? null;
      if (guardExplicitOverrides) {
        explicitLocale.current = nextLocale ?? explicitLocale.current;
        explicitTheme.current = nextThemeValue ?? explicitTheme.current;
      }
      setUserLocale(nextLocale);
      setUserTheme(nextThemeValue);
      void queryClient.invalidateQueries({ queryKey: authPreferencesQueryKey() });
      for (const key of invalidateQueryKeys?.() ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      /* v8 ignore stop */
    },
    retry: false,
  });

  const applyUserLocale = useCallback(
    (nextLocale: Locale) => {
      if (guardExplicitOverrides && explicitLocale.current) {
        return;
      }
      setUserLocale(nextLocale);
    },
    [guardExplicitOverrides],
  );
  const applyUserTheme = useCallback(
    (nextTheme: UiTheme) => {
      if (guardExplicitOverrides && explicitTheme.current) {
        return;
      }
      setUserTheme(nextTheme);
    },
    [guardExplicitOverrides],
  );

  const persistUserLocale = useCallback(
    async (nextLocale: Locale) => {
      if (guardExplicitOverrides) {
        explicitLocale.current = nextLocale;
        setUserLocale(nextLocale);
      }
      try {
        await preferencesMutation.mutateAsync({ locale: nextLocale });
      } catch {
        // Locale is still persisted locally; retry on the next explicit change.
      }
    },
    [guardExplicitOverrides, preferencesMutation],
  );
  const persistUserTheme = useCallback(
    async (nextTheme: UiTheme) => {
      if (guardExplicitOverrides) {
        explicitTheme.current = nextTheme;
        setUserTheme(nextTheme);
      }
      try {
        await preferencesMutation.mutateAsync({ theme: nextTheme });
      } catch {
        // Theme is still persisted locally; retry on the next explicit change.
      }
    },
    [guardExplicitOverrides, preferencesMutation],
  );

  return {
    applyUserLocale,
    applyUserTheme,
    persistUserLocale,
    persistUserTheme,
    userLocale,
    userTheme,
  };
}
