import { createContext, useContext } from 'react';
import type { Locale } from '@app/frontend-runtime';

/**
 * Locale controls surfaced to mobile screens, backed by the shared
 * `useUserPreferenceControls` hook (the same model the web app uses). Provided
 * above the navigator by `MobileAppProviders`.
 */
export interface MobileRuntime {
  applyUserLocale: (locale: Locale) => void;
  persistUserLocale: (locale: Locale) => Promise<void>;
  userLocale: Locale | null;
}

const MobileRuntimeContext = createContext<MobileRuntime | null>(null);

export const MobileRuntimeProvider = MobileRuntimeContext.Provider;

export const useMobileRuntime = (): MobileRuntime => {
  const runtime = useContext(MobileRuntimeContext);
  if (!runtime) {
    throw new Error('useMobileRuntime must be used within MobileAppProviders.');
  }
  return runtime;
};
