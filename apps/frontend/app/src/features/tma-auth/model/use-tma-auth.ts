import { useEffect, useMemo } from 'react';
import { deepSnakeToCamelObjKeys, retrieveLaunchParams, useRawInitData } from '@tma.js/sdk-react';
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
    return undefined;
  }
};

export function useTmaAuth({ error, fallbackStartParam, isVerifying, onAuthenticate, status }: UseTmaAuthInput) {
  // The Telegram SDK hooks must run unconditionally in the same order on every
  // render. `useLaunchParams` throws (via retrieveLaunchParams) outside the
  // Telegram runtime, so we mirror its useMemo internals and guard the resolved
  // value instead of guarding the hook call. `useRawInitData` already returns
  // undefined when there is no init data, so it is safe to call directly.
  const launchParams = useMemo(() => {
    try {
      return deepSnakeToCamelObjKeys(retrieveLaunchParams());
    } catch {
      return null;
    }
  }, []);
  const rawInitData = useRawInitData();

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
