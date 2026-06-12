import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthApiClient } from "@app/api-client";
import type { Locale } from "@app/common/i18n";
import type { UiTheme } from "@app/frontend-ui";
import {
  getPayloadLocale,
  getPayloadTheme,
  profileQueryKey,
} from "../../../entities/profile";
import { authPreferencesQueryKey, updateUserPreferences } from "../api";
import type { UserPreferencePatch } from "./preferences-model";

export interface UserPreferenceControls {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  persistUserLocale: (locale: Locale) => Promise<void>;
  persistUserTheme: (theme: UiTheme) => Promise<void>;
  userLocale: Locale | null;
  userTheme: UiTheme | null;
}

export function useUserPreferenceControls(): UserPreferenceControls {
  const [userLocale, setUserLocale] = useState<Locale | null>(null);
  const [userTheme, setUserTheme] = useState<UiTheme | null>(null);
  const queryClient = useQueryClient();
  const authClient = useAuthApiClient();

  const preferencesMutation = useMutation({
    mutationFn: (nextPreferences: UserPreferencePatch) =>
      updateUserPreferences(
        authClient.api,
        authClient.requestOptions,
        nextPreferences,
      ),
    onSuccess: (body, nextPreferences) => {
      /* v8 ignore next 6 -- preference mutation falls back through optional response/request/current values. */
      setUserLocale(
        getPayloadLocale(body) ?? nextPreferences.locale ?? userLocale ?? null,
      );
      setUserTheme(
        getPayloadTheme(body) ?? nextPreferences.theme ?? userTheme ?? null,
      );
      void queryClient.invalidateQueries({
        queryKey: authPreferencesQueryKey(),
      });
      void queryClient.invalidateQueries({ queryKey: profileQueryKey() });
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

  return {
    applyUserLocale,
    applyUserTheme,
    persistUserLocale,
    persistUserTheme,
    userLocale,
    userTheme,
  };
}
