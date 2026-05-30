/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  createRootStore,
  type RootStore,
  type RootStoreOptions,
} from "./root-store";

const FrontendStateContext = createContext<RootStore | null>(null);

export interface FrontendStateProviderProps extends RootStoreOptions {
  children: ReactNode;
  store?: RootStore;
}

export function FrontendStateProvider({
  children,
  store,
  ...options
}: Readonly<FrontendStateProviderProps>) {
  const [rootStore] = useState(() => store ?? createRootStore(options));

  return (
    <FrontendStateContext.Provider value={rootStore}>
      {children}
    </FrontendStateContext.Provider>
  );
}

export const useOptionalRootStore = (): RootStore | null =>
  useContext(FrontendStateContext);

export const useRootStore = (): RootStore => {
  const store = useOptionalRootStore();

  if (!store) {
    throw new Error("useRootStore must be used within FrontendStateProvider.");
  }

  return store;
};

export const useLocaleStore = () => useRootStore().locale;
export const useAuthShellStore = () => useRootStore().authShell;
export const useUiStore = () => useRootStore().ui;
