import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthApiClient } from "@app/frontend/api-client";
import { clearApiAuthRequired } from "@app/frontend/api-support";
import { useAuthShellStore } from "@app/frontend/ui";
import {
  providerIdentitiesQueryKey,
  requestDiscordAuthorization,
  submitDiscordCallback,
  submitTelegramTma,
  submitTelegramWebLogin,
  type SocialAuthRequestInput,
} from "../api";
import {
  getReturnUrlFromExternalAuthResult,
  getSessionFromExternalAuthResult,
} from "./session";

export interface SocialAuthNavigateOptions {
  replace?: boolean;
}

export interface UseSocialAuthInput {
  navigate?: (to: string, options?: SocialAuthNavigateOptions) => void;
}

const safeReturnPath = (returnUrl?: string | null): string | null => {
  if (!returnUrl) {
    return null;
  }

  if (returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
    return returnUrl;
  }

  return null;
};

const readRedirectUrl = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const value = record.authorizationUrl ?? record.redirectUrl ?? record.url;
  return typeof value === "string" && value.trim() ? value : null;
};

export function useSocialAuth({ navigate }: UseSocialAuthInput = {}) {
  const authClient = useAuthApiClient();
  const authStore = useAuthShellStore();
  const queryClient = useQueryClient();

  const finishExternalAuth = (
    result: Awaited<ReturnType<typeof submitTelegramTma>>,
  ) => {
    const session = getSessionFromExternalAuthResult(result);
    if (session?.accessToken) {
      authStore.setSession(session.accessToken, session.refreshToken);
      clearApiAuthRequired();
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      void queryClient.invalidateQueries({
        queryKey: providerIdentitiesQueryKey(),
      });
    }

    const returnUrl = safeReturnPath(
      getReturnUrlFromExternalAuthResult(result),
    );
    if (returnUrl) {
      navigate?.(returnUrl, { replace: true });
      return;
    }

    if (result.status === "authenticated") {
      navigate?.("/profile", { replace: true });
    }
    if (result.status === "linked") {
      navigate?.("/settings", { replace: true });
    }
  };

  const telegramTmaMutation = useMutation({
    mutationFn: (input: SocialAuthRequestInput & { initData: string }) =>
      submitTelegramTma(authClient, input.initData, {
        intent: input.intent,
        linkToken: input.linkToken,
        returnUrl: input.returnUrl,
      }),
    onSuccess: finishExternalAuth,
    retry: false,
  });

  const telegramWebLoginMutation = useMutation({
    mutationFn: (
      input: SocialAuthRequestInput & { payload: Record<string, unknown> },
    ) =>
      submitTelegramWebLogin(authClient, input.payload, {
        intent: input.intent,
        linkToken: input.linkToken,
        returnUrl: input.returnUrl,
      }),
    onSuccess: finishExternalAuth,
    retry: false,
  });

  const discordMutation = useMutation({
    mutationFn: (input: SocialAuthRequestInput) =>
      requestDiscordAuthorization(authClient, input),
    onSuccess: (payload) => {
      const redirectUrl = readRedirectUrl(payload);
      if (redirectUrl) {
        globalThis.location.assign(redirectUrl);
      }
    },
    retry: false,
  });

  const discordCallbackMutation = useMutation({
    mutationFn: (input: Parameters<typeof submitDiscordCallback>[1]) =>
      submitDiscordCallback(authClient, input),
    onSuccess: finishExternalAuth,
    retry: false,
  });

  return {
    authenticateTelegramTma: telegramTmaMutation.mutate,
    authenticateTelegramTmaAsync: telegramTmaMutation.mutateAsync,
    authenticateTelegramWebLogin: telegramWebLoginMutation.mutate,
    continueWithDiscord: discordMutation.mutate,
    completeDiscordCallback: discordCallbackMutation.mutate,
    discordCallbackError: discordCallbackMutation.error,
    discordCallbackStatus: discordCallbackMutation.status,
    discordStatus: discordMutation.status,
    isDiscordCallbackPending: discordCallbackMutation.isPending,
    isDiscordPending: discordMutation.isPending,
    isTelegramTmaPending: telegramTmaMutation.isPending,
    isTelegramWebLoginPending: telegramWebLoginMutation.isPending,
    telegramTmaError: telegramTmaMutation.error,
    telegramTmaStatus: telegramTmaMutation.status,
    telegramWebLoginStatus: telegramWebLoginMutation.status,
  };
}
