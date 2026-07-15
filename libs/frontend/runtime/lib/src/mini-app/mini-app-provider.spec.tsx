import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniAppProvider, useMiniApp, useMiniAppBackButton } from './mini-app-provider';

const sdk = vi.hoisted(() => {
  const cleanupMiniAppCss = vi.fn();
  const cleanupThemeCss = vi.fn();
  const cleanupViewportCss = vi.fn();
  const cleanupBack = vi.fn();
  const availableMethod = () => Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) });
  const headerColorMethod = Object.assign(vi.fn(), {
    isAvailable: vi.fn(() => true),
    supports: vi.fn(() => true),
  });
  const requestFullscreen = Object.assign(
    vi.fn(() => Promise.resolve()),
    {
      isAvailable: vi.fn(() => true),
    },
  );

  return {
    backButton: {
      hide: vi.fn(),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
      onClick: vi.fn(() => cleanupBack),
      show: vi.fn(),
    },
    cleanupBack,
    cleanupMiniAppCss,
    cleanupThemeCss,
    cleanupViewportCss,
    init: vi.fn(),
    isTMA: vi.fn(() => false),
    miniApp: {
      bindCssVars: vi.fn(() => cleanupMiniAppCss),
      isCssVarsBound: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
      ready: vi.fn(),
      setBgColor: availableMethod(),
      setBottomBarColor: availableMethod(),
      setHeaderColor: headerColorMethod,
    },
    shareURL: vi.fn(),
    themeParams: {
      bindCssVars: vi.fn(() => cleanupThemeCss),
      isCssVarsBound: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
    },
    viewport: {
      bindCssVars: vi.fn(() => cleanupViewportCss),
      expand: vi.fn(),
      isCssVarsBound: vi.fn(() => false),
      isFullscreen: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(() => Promise.resolve()),
      requestFullscreen,
    },
  };
});

vi.mock('@tma.js/sdk-react', () => sdk);

function Probe({ onBack = vi.fn() }: Readonly<{ onBack?: () => void }>) {
  const miniApp = useMiniApp();
  useMiniAppBackButton({ isVisible: true, onBack });

  return (
    <div data-testid="environment" data-value={miniApp.environment}>
      <button
        onClick={() =>
          void miniApp.share({
            text: 'Shared from the app',
            title: 'User App',
            url: 'https://app.example.com/profile?tgWebAppData=secret&ref=friend#launch',
          })
        }
        type="button"
      >
        Share
      </button>
    </div>
  );
}

describe('MiniAppProvider', () => {
  beforeEach(() => {
    sdk.isTMA.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares through the browser and stays safe outside Telegram', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });

    render(
      <MiniAppProvider>
        <Probe />
      </MiniAppProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => {
      expect(share).toHaveBeenCalledOnce();
    });
    expect(screen.getByTestId('environment').dataset.value).toBe('browser');
    expect(share).toHaveBeenCalledWith({
      text: 'Shared from the app',
      title: 'User App',
      url: 'https://app.example.com/profile?ref=friend',
    });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.backButton.show).not.toHaveBeenCalled();
  });

  it('initializes Telegram chrome, fullscreen, native back, and Telegram sharing', async () => {
    sdk.isTMA.mockReturnValue(true);
    const onBack = vi.fn();

    const view = render(
      <MiniAppProvider backgroundColor="#ffffff" bottomBarColor="#111827" headerColor="#2563eb">
        <Probe onBack={onBack} />
      </MiniAppProvider>,
    );

    await waitFor(() => {
      expect(sdk.viewport.requestFullscreen).toHaveBeenCalledOnce();
    });
    expect(screen.getByTestId('environment').dataset.value).toBe('telegram');
    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.themeParams.mount).toHaveBeenCalledOnce();
    expect(sdk.miniApp.mount).toHaveBeenCalledOnce();
    expect(sdk.miniApp.setBgColor).toHaveBeenCalledWith('#ffffff');
    expect(sdk.miniApp.setHeaderColor).toHaveBeenCalledWith('#2563eb');
    expect(sdk.miniApp.setBottomBarColor).toHaveBeenCalledWith('#111827');
    expect(sdk.miniApp.ready).toHaveBeenCalledOnce();
    expect(sdk.viewport.expand).toHaveBeenCalledOnce();
    expect(sdk.backButton.show).toHaveBeenCalledOnce();

    sdk.backButton.onClick.mock.calls[0]?.[0]();
    expect(onBack).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(sdk.shareURL).toHaveBeenCalledWith('https://app.example.com/profile?ref=friend', 'Shared from the app');

    view.unmount();
    expect(sdk.cleanupMiniAppCss).toHaveBeenCalledOnce();
    expect(sdk.cleanupThemeCss).toHaveBeenCalledOnce();
    expect(sdk.cleanupViewportCss).toHaveBeenCalledOnce();
    expect(sdk.cleanupBack).toHaveBeenCalledOnce();
  });
});
