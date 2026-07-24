import { useEffect, useMemo } from 'react';
import { deepSnakeToCamelObjKeys, retrieveLaunchParams, retrieveRawInitData } from '@tma.js/sdk-react';
import { parseTmaLaunchState, type TmaLaunchIntent } from './tma-launch';

interface UseTmaAuthInput {
  fallbackStartParam?: string;
  onAuthenticate: (input: { initData: string; intent: TmaLaunchIntent; returnUrl?: string }) => void;
  status: string;
  error: unknown;
  isVerifying: boolean;
}

const readBrowserStartParam = (): string | undefined => {
  try {
    const searchParams = new URLSearchParams(globalThis.location.search);
    return (
      searchParams.get('startapp') ??
      searchParams.get('start_param') ??
      searchParams.get('tgWebAppStartParam') ??
      undefined
    );
  } catch {
    /* v8 ignore next -- URLSearchParams over location.search cannot throw; defensive fallback. */
    return undefined;
  }
};

export function useTmaAuth({ error, fallbackStartParam, isVerifying, onAuthenticate, status }: UseTmaAuthInput) {
  // Telegram launch-data retrieval throws outside Telegram. Keep both reads in
  // unconditional memo hooks, but convert that expected environment mismatch
  // into the browser fallback state instead of tripping the app error boundary.
  const launchParams = useMemo(() => {
    try {
      return deepSnakeToCamelObjKeys(retrieveLaunchParams());
    } catch {
      return null;
    }
  }, []);
  const rawInitData = useMemo(() => {
    try {
      return retrieveRawInitData();
    } catch {
      return undefined;
    }
  }, []);

  const telegramStartParam =
    launchParams && 'tgWebAppStartParam' in launchParams ? launchParams.tgWebAppStartParam : undefined;
  const isTelegram = Boolean(rawInitData);
  const browserStartParam = readBrowserStartParam();
  const parsedLaunchState = useMemo(
    () =>
      parseTmaLaunchState({
        initData: rawInitData,
        isTelegram,
        startParam: telegramStartParam ?? browserStartParam ?? fallbackStartParam,
      }),
    [browserStartParam, fallbackStartParam, isTelegram, rawInitData, telegramStartParam],
  );

  useEffect(() => {
    if (!rawInitData || status !== 'idle') {
      return;
    }

    onAuthenticate({
      initData: rawInitData,
      intent: parsedLaunchState.intent,
      returnUrl: parsedLaunchState.returnUrl,
    });
  }, [onAuthenticate, parsedLaunchState, rawInitData, status]);

  return {
    ...parsedLaunchState,
    error,
    isTelegram,
    isVerifying,
    rawInitData,
    status,
  };
}
