// @requirements REQ-FRONTEND-SHELL-004
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MiniAppProvider,
  useMiniApp,
  useMiniAppBackButton,
  type MiniAppContextValue,
  type MiniAppShareInput,
} from './mini-app-provider';

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
      onClick: vi.fn<(listener: VoidFunction) => VoidFunction | undefined>(() => cleanupBack),
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
    swipeBehavior: {
      disableVertical: availableMethod(),
      enableVertical: availableMethod(),
      isMounted: vi.fn(() => false),
      isSupported: vi.fn(() => true),
      mount: vi.fn(),
      unmount: vi.fn(),
    },
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

let currentMiniApp: MiniAppContextValue | undefined;

function ContextProbe({
  isBackVisible = true,
  onBack = vi.fn(),
}: Readonly<{ isBackVisible?: boolean; onBack?: () => void }>) {
  currentMiniApp = useMiniApp();
  useMiniAppBackButton({ isVisible: isBackVisible, onBack });
  return <div data-testid="context-environment">{currentMiniApp.environment}</div>;
}

const shareInput = (overrides: Partial<MiniAppShareInput> = {}): MiniAppShareInput => ({
  text: 'Shared from the app',
  title: 'User App',
  url: 'https://app.example.com/profile?tgWebAppData=secret&ref=friend#launch',
  ...overrides,
});

describe('MiniAppProvider', () => {
  beforeEach(() => {
    currentMiniApp = undefined;
    sdk.isTMA.mockReset().mockReturnValue(false);
    sdk.init.mockReset();
    sdk.shareURL.mockReset();
    sdk.backButton.hide.mockReset();
    sdk.backButton.isMounted.mockReset().mockReturnValue(false);
    sdk.backButton.mount.mockReset();
    sdk.backButton.onClick.mockReset().mockReturnValue(sdk.cleanupBack);
    sdk.backButton.show.mockReset();
    sdk.themeParams.bindCssVars.mockReset().mockReturnValue(sdk.cleanupThemeCss);
    sdk.themeParams.isCssVarsBound.mockReset().mockReturnValue(false);
    sdk.themeParams.isMounted.mockReset().mockReturnValue(false);
    sdk.themeParams.mount.mockReset();
    sdk.miniApp.bindCssVars.mockReset().mockReturnValue(sdk.cleanupMiniAppCss);
    sdk.miniApp.isCssVarsBound.mockReset().mockReturnValue(false);
    sdk.miniApp.isMounted.mockReset().mockReturnValue(false);
    sdk.miniApp.mount.mockReset();
    sdk.miniApp.ready.mockReset();
    sdk.miniApp.setBgColor.mockReset();
    sdk.miniApp.setBgColor.isAvailable.mockReset().mockReturnValue(true);
    sdk.miniApp.setBottomBarColor.mockReset();
    sdk.miniApp.setBottomBarColor.isAvailable.mockReset().mockReturnValue(true);
    sdk.miniApp.setHeaderColor.mockReset();
    sdk.miniApp.setHeaderColor.isAvailable.mockReset().mockReturnValue(true);
    sdk.miniApp.setHeaderColor.supports.mockReset().mockReturnValue(true);
    sdk.swipeBehavior.disableVertical.mockReset();
    sdk.swipeBehavior.disableVertical.isAvailable.mockReset().mockReturnValue(true);
    sdk.swipeBehavior.enableVertical.mockReset();
    sdk.swipeBehavior.enableVertical.isAvailable.mockReset().mockReturnValue(true);
    sdk.swipeBehavior.isMounted.mockReset().mockReturnValue(false);
    sdk.swipeBehavior.isSupported.mockReset().mockReturnValue(true);
    sdk.swipeBehavior.mount.mockReset();
    sdk.swipeBehavior.unmount.mockReset();
    sdk.viewport.bindCssVars.mockReset().mockReturnValue(sdk.cleanupViewportCss);
    sdk.viewport.expand.mockReset();
    sdk.viewport.isCssVarsBound.mockReset().mockReturnValue(false);
    sdk.viewport.isFullscreen.mockReset().mockReturnValue(false);
    sdk.viewport.isMounted.mockReset().mockReturnValue(false);
    sdk.viewport.mount.mockReset().mockResolvedValue(undefined);
    sdk.viewport.requestFullscreen.mockReset().mockResolvedValue(undefined);
    sdk.viewport.requestFullscreen.isAvailable.mockReset().mockReturnValue(true);
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
    expect(sdk.swipeBehavior.mount).toHaveBeenCalledOnce();
    expect(sdk.swipeBehavior.disableVertical).toHaveBeenCalledOnce();

    sdk.backButton.onClick.mock.calls[0]?.[0]();
    expect(onBack).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(sdk.shareURL).toHaveBeenCalledWith('https://app.example.com/profile?ref=friend', 'Shared from the app');

    view.unmount();
    expect(sdk.cleanupMiniAppCss).toHaveBeenCalledOnce();
    expect(sdk.cleanupThemeCss).toHaveBeenCalledOnce();
    expect(sdk.cleanupViewportCss).toHaveBeenCalledOnce();
    expect(sdk.cleanupBack).toHaveBeenCalledOnce();
    expect(sdk.swipeBehavior.enableVertical).toHaveBeenCalledOnce();
    expect(sdk.swipeBehavior.unmount).toHaveBeenCalledOnce();
  });

  it('covers browser cancellation, clipboard, open, and unavailable share fallbacks', async () => {
    const nativeShare = vi
      .fn<NonNullable<Navigator['share']>>()
      .mockRejectedValue(new Error('native share blocked'))
      .mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    const writeText = vi
      .fn<NonNullable<Clipboard['writeText']>>()
      .mockResolvedValueOnce()
      .mockRejectedValue(new Error('blocked'));
    const open = vi
      .fn()
      .mockReturnValueOnce({})
      .mockReturnValueOnce(null)
      .mockImplementationOnce(() => {
        throw new Error('popup blocked');
      });
    vi.stubGlobal('navigator', { clipboard: { writeText }, share: nativeShare });
    vi.stubGlobal('open', open);

    render(
      <MiniAppProvider>
        <ContextProbe />
      </MiniAppProvider>,
    );

    await expect(currentMiniApp?.share(shareInput())).resolves.toBe('cancelled');
    await expect(currentMiniApp?.share(shareInput())).resolves.toBe('copied');
    await expect(currentMiniApp?.share(shareInput({ text: undefined }))).resolves.toBe('opened');
    await expect(currentMiniApp?.share(shareInput({ text: undefined, url: 'https://[' }))).resolves.toBe('unavailable');
    await expect(currentMiniApp?.share(shareInput({ text: undefined }))).resolves.toBe('unavailable');

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    await expect(currentMiniApp?.share(shareInput())).resolves.toBe('copied');
    vi.stubGlobal('navigator', {});
    await expect(currentMiniApp?.share(shareInput())).resolves.toBe('unavailable');
    expect(open.mock.calls[0]?.[0].toString()).toContain('https://t.me/share/url?');
    expect(open.mock.calls[0]?.[0].toString()).not.toContain('tgWebAppData');
  });

  it('treats Telegram detection errors as a browser environment', () => {
    sdk.isTMA.mockImplementation(() => {
      throw new Error('missing launch params');
    });

    render(
      <MiniAppProvider>
        <ContextProbe isBackVisible={false} />
      </MiniAppProvider>,
    );

    expect(screen.getByTestId('context-environment').textContent).toBe('browser');
    expect(sdk.backButton.hide).toHaveBeenCalledOnce();
  });

  it('respects already-mounted Telegram SDK state and legacy header colors', async () => {
    sdk.isTMA.mockReturnValue(true);
    sdk.themeParams.isMounted.mockReturnValue(true);
    sdk.themeParams.isCssVarsBound.mockReturnValue(true);
    sdk.miniApp.isMounted.mockReturnValue(true);
    sdk.miniApp.isCssVarsBound.mockReturnValue(true);
    sdk.miniApp.setBgColor.isAvailable.mockReturnValue(false);
    sdk.miniApp.setBottomBarColor.isAvailable.mockReturnValue(false);
    sdk.miniApp.setHeaderColor.supports.mockReturnValue(false);
    sdk.backButton.isMounted.mockReturnValue(true);
    sdk.backButton.onClick.mockReturnValue(undefined);
    sdk.swipeBehavior.isMounted.mockReturnValue(true);
    sdk.swipeBehavior.disableVertical.isAvailable.mockReturnValue(false);
    sdk.swipeBehavior.enableVertical.isAvailable.mockReturnValue(false);
    sdk.viewport.isMounted.mockReturnValue(true);
    sdk.viewport.isCssVarsBound.mockReturnValue(true);
    sdk.viewport.isFullscreen.mockReturnValue(true);

    const view = render(
      <MiniAppProvider>
        <ContextProbe />
      </MiniAppProvider>,
    );

    await waitFor(() => {
      expect(currentMiniApp?.isFullscreen).toBe(true);
    });
    expect(sdk.themeParams.mount).not.toHaveBeenCalled();
    expect(sdk.themeParams.bindCssVars).not.toHaveBeenCalled();
    expect(sdk.miniApp.mount).not.toHaveBeenCalled();
    expect(sdk.miniApp.bindCssVars).not.toHaveBeenCalled();
    expect(sdk.miniApp.setBgColor).not.toHaveBeenCalled();
    expect(sdk.miniApp.setHeaderColor).toHaveBeenCalledWith('bg_color');
    expect(sdk.miniApp.setBottomBarColor).not.toHaveBeenCalled();
    expect(sdk.backButton.mount).not.toHaveBeenCalled();
    expect(sdk.swipeBehavior.mount).not.toHaveBeenCalled();
    expect(sdk.swipeBehavior.disableVertical).not.toHaveBeenCalled();
    expect(sdk.viewport.mount).not.toHaveBeenCalled();
    expect(sdk.viewport.bindCssVars).not.toHaveBeenCalled();
    expect(sdk.viewport.requestFullscreen).not.toHaveBeenCalled();

    view.unmount();
    expect(sdk.swipeBehavior.enableVertical).not.toHaveBeenCalled();
    expect(sdk.swipeBehavior.unmount).not.toHaveBeenCalled();
  });

  it('keeps Telegram usable when optional swipe and viewport capabilities fail', async () => {
    sdk.isTMA.mockReturnValue(true);
    sdk.init.mockImplementation(() => {
      throw new Error('already initialized');
    });
    sdk.swipeBehavior.isSupported.mockReturnValue(false);
    sdk.miniApp.setHeaderColor.isAvailable.mockReturnValue(false);
    sdk.viewport.mount.mockRejectedValue(new Error('old Telegram client'));

    render(
      <MiniAppProvider>
        <ContextProbe />
      </MiniAppProvider>,
    );

    await waitFor(() => {
      expect(sdk.viewport.mount).toHaveBeenCalledOnce();
    });
    expect(sdk.swipeBehavior.mount).not.toHaveBeenCalled();
    expect(sdk.viewport.expand).not.toHaveBeenCalled();
  });

  it('stops asynchronous viewport setup after unmount', async () => {
    sdk.isTMA.mockReturnValue(true);
    let resolveMount: (() => void) | undefined;
    sdk.viewport.mount.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMount = resolve;
      }),
    );

    const view = render(
      <MiniAppProvider>
        <ContextProbe />
      </MiniAppProvider>,
    );
    view.unmount();
    await act(async () => {
      resolveMount?.();
      await Promise.resolve();
    });

    expect(sdk.viewport.bindCssVars).not.toHaveBeenCalled();
    expect(sdk.viewport.expand).not.toHaveBeenCalled();
  });

  it('falls back to browser sharing when Telegram sharing throws', async () => {
    sdk.isTMA.mockReturnValue(true);
    sdk.shareURL.mockImplementation(() => {
      throw new Error('share unavailable');
    });
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });

    render(
      <MiniAppProvider>
        <ContextProbe />
      </MiniAppProvider>,
    );

    await expect(currentMiniApp?.share(shareInput())).resolves.toBe('shared');
    expect(sdk.shareURL).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledOnce();
  });
});
