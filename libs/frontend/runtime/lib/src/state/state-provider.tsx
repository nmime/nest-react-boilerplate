/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { createContext, useContext, useState, type ReactNode } from "react";
import {
  createRootStore,
  type RootStore,
  type RootStoreOptions,
} from "./root-store";
import { AppStore } from "./app-store";
import { AuthShellStore } from "./auth-shell-store";
import { LocaleStore } from "./locale-store";
import { UiStore } from "./ui-store";

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
export const useAppStore = () => useRootStore().app;

type RootStoreChild = AppStore | AuthShellStore | LocaleStore | UiStore;
type StoreConstructor<TStore extends RootStoreChild> = new (
  ...args: never[]
) => TStore;
type RegisteredStoreConstructor = StoreConstructor<RootStoreChild>;

const storeRegistry = new Map<
  RegisteredStoreConstructor,
  (rootStore: RootStore) => RootStoreChild
>([
  [AppStore, (rootStore) => rootStore.app],
  [AuthShellStore, (rootStore) => rootStore.authShell],
  [LocaleStore, (rootStore) => rootStore.locale],
  [UiStore, (rootStore) => rootStore.ui],
]);

export function useStore(): RootStore;
export function useStore<TStore extends RootStoreChild>(
  StoreClass: StoreConstructor<TStore>,
): TStore;
export function useStore(
  StoreClass?: RegisteredStoreConstructor,
): RootStore | RootStoreChild {
  const rootStore = useRootStore();

  if (!StoreClass) {
    return rootStore;
  }

  const resolveStore = storeRegistry.get(StoreClass);

  if (!resolveStore) {
    throw new Error("Requested store is not registered in RootStore.");
  }

  return resolveStore(rootStore);
}
