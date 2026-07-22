import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, useAuthApiClient } from '@app/frontend-api-client';
import { clearApiAuthRequired } from '@app/frontend-api-support';
import { useAuthShellStore } from '@app/frontend-runtime';
import { profileQueryKey } from '../../../entities/profile';
import { toAbsoluteSameOriginReturnUrl, toSameOriginReturnPath } from '../../../shared/lib';
import {
  providerIdentitiesQueryKey,
  requestDiscordAuthorization,
  startTelegramOidc,
  submitDiscordCallback,
  submitTelegramOidcSession,
  submitTelegramTma,
} from '../api';
import { getReturnUrlFromExternalAuthResult, getSessionFromExternalAuthResult } from './session';
import { saveTelegramOidcState } from './telegram-oidc-state';
import type { SocialAuthRequestInput } from './types';

export interface SocialAuthNavigateOptions {
  replace?: boolean;
}

export interface UseSocialAuthInput {
  navigate?: (to: string, options?: SocialAuthNavigateOptions) => void;
}

const withAbsoluteReturnUrl = (input: SocialAuthRequestInput): SocialAuthRequestInput => ({
  ...input,
  returnUrl: toAbsoluteSameOriginReturnUrl(input.returnUrl),
});

const readRedirectUrl = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const value = record.authorizationUrl ?? record.redirectUrl ?? record.url;
  return typeof value === 'string' && value.trim() ? value : null;
};

export function useSocialAuth({ navigate }: UseSocialAuthInput = {}) {
  const authClient = useAuthApiClient();
  const authStore = useAuthShellStore();
  const queryClient = useQueryClient();

  const finishExternalAuth = (result: Awaited<ReturnType<typeof submitTelegramTma>>) => {
    const session = getSessionFromExternalAuthResult(result);
    if (session) {
      authStore.markAuthenticated();
      clearApiAuthRequired();
      void queryClient.invalidateQueries({
        queryKey: authApi.getAuthControllerMeQueryKey(),
      });
      void queryClient.invalidateQueries({ queryKey: profileQueryKey() });
      void queryClient.invalidateQueries({
        queryKey: providerIdentitiesQueryKey(),
      });
    }

    const returnUrl = toSameOriginReturnPath(getReturnUrlFromExternalAuthResult(result));
    if (returnUrl) {
      navigate?.(returnUrl, { replace: true });
      return;
    }

    if (result.status === 'authenticated') {
      navigate?.('/profile', { replace: true });
    }
    if (result.status === 'linked') {
      navigate?.('/settings', { replace: true });
    }
  };

  const telegramTmaMutation = useMutation({
    mutationFn: (input: SocialAuthRequestInput & { initData: string }) =>
      submitTelegramTma(
        authClient,
        input.initData,
        withAbsoluteReturnUrl({
          intent: input.intent,
          linkToken: input.linkToken,
          returnUrl: input.returnUrl,
        }),
      ),
    onSuccess: finishExternalAuth,
    retry: false,
  });

  const telegramOidcMutation = useMutation({
    mutationFn: async (input: SocialAuthRequestInput) => {
      saveTelegramOidcState(input);
      const callbackURL = new URL('/auth/telegram/callback', globalThis.location.origin).toString();
      return startTelegramOidc(authClient, callbackURL);
    },
    onSuccess: (payload) => {
      if (payload.url) {
        globalThis.location.assign(payload.url);
      }
    },
    retry: false,
  });

  const telegramOidcCallbackMutation = useMutation({
    mutationFn: (input: SocialAuthRequestInput) => submitTelegramOidcSession(authClient, withAbsoluteReturnUrl(input)),
    onSuccess: finishExternalAuth,
    retry: false,
  });

  const discordMutation = useMutation({
    mutationFn: (input: SocialAuthRequestInput) =>
      requestDiscordAuthorization(authClient, withAbsoluteReturnUrl(input)),
    onSuccess: (payload) => {
      const redirectUrl = readRedirectUrl(payload);
      if (redirectUrl) {
        globalThis.location.assign(redirectUrl);
      }
    },
    retry: false,
  });

  const discordCallbackMutation = useMutation({
    mutationFn: (input: Parameters<typeof submitDiscordCallback>[1]) => submitDiscordCallback(authClient, input),
    onSuccess: finishExternalAuth,
    retry: false,
  });

  return {
    authenticateTelegramTma: telegramTmaMutation.mutate,
    authenticateTelegramTmaAsync: telegramTmaMutation.mutateAsync,
    continueWithTelegram: telegramOidcMutation.mutate,
    completeTelegramOidc: telegramOidcCallbackMutation.mutate,
    continueWithDiscord: discordMutation.mutate,
    completeDiscordCallback: discordCallbackMutation.mutate,
    discordCallbackError: discordCallbackMutation.error,
    discordCallbackStatus: discordCallbackMutation.status,
    discordStatus: discordMutation.status,
    isDiscordCallbackPending: discordCallbackMutation.isPending,
    isDiscordPending: discordMutation.isPending,
    isTelegramTmaPending: telegramTmaMutation.isPending,
    isTelegramOidcPending: telegramOidcMutation.isPending,
    isTelegramOidcCallbackPending: telegramOidcCallbackMutation.isPending,
    telegramTmaError: telegramTmaMutation.error,
    telegramTmaStatus: telegramTmaMutation.status,
    telegramOidcError: telegramOidcMutation.error,
    telegramOidcStatus: telegramOidcMutation.status,
    telegramOidcCallbackError: telegramOidcCallbackMutation.error,
    telegramOidcCallbackStatus: telegramOidcCallbackMutation.status,
  };
}
