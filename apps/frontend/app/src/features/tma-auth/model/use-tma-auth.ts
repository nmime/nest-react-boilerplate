import { useEffect, useMemo } from "react";
import {
  backButton,
  init,
  miniApp,
  useLaunchParams,
  useRawInitData,
  viewport,
} from "@tma.js/sdk-react";
import { mapTmaStartParamToRoute } from "./tma-launch";

interface UseTmaAuthInput {
  onAuthenticate: (input: {
    initData: string;
    intent: "login";
    returnUrl?: string;
  }) => void;
  onBack: () => void;
  status: string;
  error: unknown;
  isVerifying: boolean;
}

const safely = (effect: () => void) => {
  try {
    effect();
  } catch {
    // Telegram features are optional outside the Telegram runtime.
  }
};

export function useTmaAuth({
  error,
  isVerifying,
  onAuthenticate,
  onBack,
  status,
}: UseTmaAuthInput) {
  const launchState = (() => {
    try {
      return {
        launchParams: useLaunchParams(true),
        rawInitData: useRawInitData(),
      };
    } catch {
      return { launchParams: null, rawInitData: undefined };
    }
  })();

  const startParam =
    launchState.launchParams && "tgWebAppStartParam" in launchState.launchParams
      ? launchState.launchParams.tgWebAppStartParam
      : undefined;
  const rawInitData = launchState.rawInitData;
  const isTelegram = Boolean(rawInitData);
  const mappedRoute = useMemo(
    () => mapTmaStartParamToRoute(startParam),
    [startParam],
  );

  useEffect(() => {
    if (!isTelegram) {
      return;
    }

    safely(() => init());
    safely(() => miniApp.mount());
    safely(() => miniApp.ready());
    safely(() => miniApp.bindCssVars());
    safely(() => void viewport.mount());
    safely(() => viewport.expand());
    safely(() => viewport.bindCssVars());
    safely(() => backButton.mount());
    safely(() => backButton.show());
    const cleanup = (() => {
      try {
        return backButton.onClick(onBack);
      } catch {
        return undefined;
      }
    })();

    return () => {
      cleanup?.();
      safely(() => backButton.hide());
    };
  }, [isTelegram, onBack]);

  useEffect(() => {
    if (!rawInitData || status !== "idle") {
      return;
    }

    onAuthenticate({
      initData: rawInitData,
      intent: "login",
      returnUrl: mappedRoute ?? undefined,
    });
  }, [mappedRoute, onAuthenticate, rawInitData, status]);

  return {
    error,
    isTelegram,
    isVerifying,
    mappedRoute,
    rawInitData,
    status,
  };
}
