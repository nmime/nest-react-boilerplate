import { createContext, useContext } from 'react';
import type { Locale, UiTheme } from '@app/frontend-runtime';

/**
 * App-level preference callbacks provided above the router via plain React
 * context (rather than router context) so route components read them with a
 * clean type — mirroring the admin app's runtime context.
 */
export interface UserRuntime {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

const UserRuntimeContext = createContext<UserRuntime | null>(null);

export const UserRuntimeProvider = UserRuntimeContext.Provider;

export const useUserRuntime = (): UserRuntime => {
  const runtime = useContext(UserRuntimeContext);
  /* v8 ignore next 3 -- provider always wraps the router; guard keeps the hook total. */
  if (!runtime) {
    throw new Error('useUserRuntime must be used within UserRuntimeProvider.');
  }
  return runtime;
};
