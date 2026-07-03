/* v8 ignore file -- host shell hooks depend on browser/TMA integration and degrade to no-ops for SSR. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppStore, useUiStore, type UiTheme } from "../state";

type TelegramWebApp = {
  BackButton?: {
    hide?: () => void;
    offClick?: (handler: () => void) => void;
    onClick?: (handler: () => void) => void;
    show?: () => void;
  };
  MainButton?: {
    hide?: () => void;
    show?: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export interface GlobalOverlayContextValue {
  overlay: ReactNode | null;
  hideOverlay: () => void;
  showOverlay: (overlay: ReactNode) => void;
}

const fallbackOverlayContext: GlobalOverlayContextValue = {
  overlay: null,
  hideOverlay: () => undefined,
  showOverlay: () => undefined,
};

const GlobalOverlayContext = createContext<GlobalOverlayContextValue | null>(
  null,
);

export interface GlobalOverlayProviderProps {
  children: ReactNode;
}

export function GlobalOverlayProvider({
  children,
}: Readonly<GlobalOverlayProviderProps>) {
  const [overlay, setOverlay] = useState<ReactNode | null>(null);
  const hideOverlay = useCallback(() => setOverlay(null), []);
  const showOverlay = useCallback((nextOverlay: ReactNode) => {
    setOverlay(nextOverlay);
  }, []);
  const value = useMemo<GlobalOverlayContextValue>(
    () => ({ hideOverlay, overlay, showOverlay }),
    [hideOverlay, overlay, showOverlay],
  );

  return (
    <GlobalOverlayContext.Provider value={value}>
      {children}
      {overlay}
    </GlobalOverlayContext.Provider>
  );
}

export function useGlobalOverlayContext(): GlobalOverlayContextValue {
  return useContext(GlobalOverlayContext) ?? fallbackOverlayContext;
}

export interface ThemeHookValue {
  resolvedTheme: "light" | "dark";
  setTheme: (theme: UiTheme) => void;
  theme: UiTheme;
}

export function useTheme(): ThemeHookValue {
  const uiStore = useUiStore();

  return useMemo(
    () => ({
      resolvedTheme: uiStore.resolvedTheme,
      setTheme: (theme: UiTheme) => uiStore.setTheme(theme),
      theme: uiStore.theme,
    }),
    [uiStore, uiStore.resolvedTheme, uiStore.theme],
  );
}

const getTelegramWebApp = (): TelegramWebApp | undefined =>
  typeof window === "undefined" ? undefined : window.Telegram?.WebApp;

export interface BackHandlerOptions {
  forceHide?: boolean;
}

export function useBackHandler(
  handler?: () => void,
  options: BackHandlerOptions = {},
): void {
  const appStore = useAppStore();
  const { forceHide = false } = options;

  useEffect(() => {
    const isVisible = Boolean(handler) && !forceHide;
    appStore.setBackHandlerVisible(isVisible);

    const backButton = getTelegramWebApp()?.BackButton;
    if (!isVisible || !handler) {
      backButton?.hide?.();
      return undefined;
    }

    backButton?.show?.();
    backButton?.onClick?.(handler);
    window.addEventListener("popstate", handler);

    return () => {
      backButton?.offClick?.(handler);
      backButton?.hide?.();
      window.removeEventListener("popstate", handler);
      appStore.setBackHandlerVisible(false);
    };
  }, [appStore, forceHide, handler]);
}

export function useTabBarVisibility(visible: boolean): void {
  const appStore = useAppStore();

  useEffect(() => {
    appStore.setTabBarVisible(visible);
    const mainButton = getTelegramWebApp()?.MainButton;

    if (visible) {
      mainButton?.show?.();
    } else {
      mainButton?.hide?.();
    }
  }, [appStore, visible]);
}
