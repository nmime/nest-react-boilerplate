import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { backButton, init, isTMA, miniApp, shareURL, themeParams, viewport } from '@tma.js/sdk-react';

export type MiniAppEnvironment = 'browser' | 'telegram';
export type MiniAppShareResult = 'cancelled' | 'copied' | 'opened' | 'shared' | 'unavailable';

export interface MiniAppShareInput {
  text?: string;
  title?: string;
  url: string;
}

export interface MiniAppContextValue {
  environment: MiniAppEnvironment;
  isFullscreen: boolean;
  isTelegram: boolean;
  share: (input: MiniAppShareInput) => Promise<MiniAppShareResult>;
}

export interface MiniAppProviderProps {
  backgroundColor?: string;
  bottomBarColor?: string;
  children: ReactNode;
  headerColor?: string;
}

const defaultColors = {
  background: '#f8fafc',
  bottomBar: '#0f172a',
  header: '#2563eb',
} as const;

const safely = <T,>(operation: () => T): T | undefined => {
  try {
    return operation();
  } catch {
    return undefined;
  }
};

const detectTelegram = (): boolean => safely(() => isTMA()) ?? false;

const sanitizeShareUrl = (input: string): string => {
  try {
    const browserGlobal = globalThis as { location?: Pick<Location, 'origin'> };
    const url = new URL(input, browserGlobal.location?.origin);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('tgwebapp')) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.toString();
  } catch {
    return input;
  }
};

const shareInBrowser = async ({ text, title, url }: MiniAppShareInput): Promise<MiniAppShareResult> => {
  const safeUrl = sanitizeShareUrl(url);
  const browserGlobal = globalThis as {
    navigator?: {
      clipboard?: Pick<Clipboard, 'writeText'>;
      share?: (data: ShareData) => Promise<void>;
    };
    open?: (url?: string | URL, target?: string, features?: string) => Window | null;
  };
  const browserNavigator = browserGlobal.navigator;

  if (browserNavigator?.share) {
    try {
      await browserNavigator.share({ text, title, url: safeUrl });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  if (browserNavigator?.clipboard?.writeText) {
    try {
      await browserNavigator.clipboard.writeText([text, safeUrl].filter(Boolean).join('\n'));
      return 'copied';
    } catch {
      // Fall through to the Telegram share URL when clipboard access is blocked.
    }
  }

  const shareLink = new URL('https://t.me/share/url');
  shareLink.searchParams.set('url', safeUrl);
  if (text) {
    shareLink.searchParams.set('text', text);
  }
  const opened = safely(() => browserGlobal.open?.(shareLink, '_blank', 'noopener,noreferrer'));
  return opened ? 'opened' : 'unavailable';
};

const fallbackContext: MiniAppContextValue = {
  environment: 'browser',
  isFullscreen: false,
  isTelegram: false,
  share: shareInBrowser,
};

const MiniAppContext = createContext<MiniAppContextValue>(fallbackContext);

export function MiniAppProvider({
  backgroundColor = defaultColors.background,
  bottomBarColor = defaultColors.bottomBar,
  children,
  headerColor = defaultColors.header,
}: Readonly<MiniAppProviderProps>) {
  const isTelegram = useMemo(detectTelegram, []);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isTelegram) {
      return;
    }

    const lifecycle = new AbortController();
    const cleanups: VoidFunction[] = [];

    safely(() => init());
    safely(() => {
      if (!themeParams.isMounted()) {
        themeParams.mount();
      }
      if (!themeParams.isCssVarsBound()) {
        cleanups.push(themeParams.bindCssVars());
      }
    });
    safely(() => {
      if (!miniApp.isMounted()) {
        miniApp.mount();
      }
      if (!miniApp.isCssVarsBound()) {
        cleanups.push(miniApp.bindCssVars());
      }
      if (miniApp.setBgColor.isAvailable()) {
        miniApp.setBgColor(backgroundColor);
      }
      if (miniApp.setHeaderColor.isAvailable()) {
        miniApp.setHeaderColor(miniApp.setHeaderColor.supports('rgb') ? headerColor : 'bg_color');
      }
      if (miniApp.setBottomBarColor.isAvailable()) {
        miniApp.setBottomBarColor(bottomBarColor);
      }
      miniApp.ready();
    });
    safely(() => {
      if (!backButton.isMounted()) {
        backButton.mount();
      }
    });

    const prepareViewport = async () => {
      try {
        if (!viewport.isMounted()) {
          await viewport.mount();
        }
        if (lifecycle.signal.aborted) {
          return;
        }
        if (!viewport.isCssVarsBound()) {
          cleanups.push(viewport.bindCssVars());
        }
        viewport.expand();
        setIsFullscreen(viewport.isFullscreen());
        if (!viewport.isFullscreen() && viewport.requestFullscreen.isAvailable()) {
          await viewport.requestFullscreen();
          setIsFullscreen(true);
        }
      } catch {
        // Expansion remains a valid full-height fallback on older Telegram clients.
      }
    };

    void prepareViewport();

    return () => {
      lifecycle.abort();
      safely(() => {
        backButton.hide();
      });
      const cleanupStack = [...cleanups];
      cleanupStack.reverse();
      for (const cleanup of cleanupStack) {
        safely(cleanup);
      }
    };
  }, [backgroundColor, bottomBarColor, headerColor, isTelegram]);

  const share = useCallback(
    async (input: MiniAppShareInput): Promise<MiniAppShareResult> => {
      const sanitizedInput = { ...input, url: sanitizeShareUrl(input.url) };
      if (isTelegram) {
        try {
          shareURL(sanitizedInput.url, sanitizedInput.text);
          return 'shared';
        } catch {
          // A browser fallback keeps previews and local development functional.
        }
      }
      return shareInBrowser(sanitizedInput);
    },
    [isTelegram],
  );

  const value = useMemo<MiniAppContextValue>(
    () => ({
      environment: isTelegram ? 'telegram' : 'browser',
      isFullscreen,
      isTelegram,
      share,
    }),
    [isFullscreen, isTelegram, share],
  );

  return <MiniAppContext.Provider value={value}>{children}</MiniAppContext.Provider>;
}

export const useMiniApp = (): MiniAppContextValue => useContext(MiniAppContext);

export const useMiniAppBackButton = ({ isVisible, onBack }: Readonly<{ isVisible: boolean; onBack: () => void }>) => {
  const { isTelegram } = useMiniApp();

  useEffect(() => {
    if (!isTelegram || !isVisible) {
      safely(() => {
        backButton.hide();
      });
      return;
    }

    safely(() => {
      backButton.show();
    });
    const removeListener = safely(() => backButton.onClick(onBack));

    return () => {
      removeListener?.();
      safely(() => {
        backButton.hide();
      });
    };
  }, [isTelegram, isVisible, onBack]);
};
