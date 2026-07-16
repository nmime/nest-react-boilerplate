import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiniAppShell } from './mini-app-shell';

const runtime = vi.hoisted(() => ({
  miniApp: {
    environment: 'browser' as 'browser' | 'telegram',
    isFullscreen: false,
    isTelegram: false,
    share: vi.fn((): Promise<'copied' | 'shared'> => Promise.resolve('copied')),
  },
  useMiniAppBackButton: vi.fn(),
}));

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();
  return {
    ...actual,
    useMiniApp: () => runtime.miniApp,
    useMiniAppBackButton: runtime.useMiniAppBackButton,
  };
});

const actions = [
  { href: '/', label: 'Home' },
  { href: '/profile', isCurrent: true, label: 'Profile' },
];

describe('MiniAppShell', () => {
  beforeEach(() => {
    runtime.miniApp.environment = 'browser';
    runtime.miniApp.isFullscreen = false;
    runtime.miniApp.isTelegram = false;
    runtime.miniApp.share.mockReset().mockResolvedValue('copied');
    runtime.useMiniAppBackButton.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders browser back and bottom navigation while sharing from either control', async () => {
    const onBack = vi.fn();
    render(
      <MiniAppShell
        actions={actions}
        activePath="/profile"
        appName="Account App"
        backLabel="Go back"
        description="Manage your account"
        eyebrow="Account"
        heroActions={[]}
        onBack={onBack}
        shareLabel="Send"
        shareText="Profile link"
        shareTitle="Profile"
        title="Profile"
      >
        Profile content
      </MiniAppShell>,
    );

    expect(document.querySelector('.xr-actions')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Account App bottom navigation' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledOnce();

    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0]!);
    await waitFor(() => {
      expect(runtime.miniApp.share).toHaveBeenCalledWith({
        text: 'Profile link',
        title: 'Profile',
        url: window.location.href,
      });
    });
    expect(screen.getAllByText('Copied')).toHaveLength(2);
    expect(screen.getByText('Share link copied to clipboard.')).not.toBeNull();
    expect(runtime.useMiniAppBackButton).toHaveBeenCalledWith({ isVisible: true, onBack });
  });

  it('uses Telegram chrome on the home route and defaults the share title', async () => {
    runtime.miniApp.environment = 'telegram';
    runtime.miniApp.isFullscreen = true;
    runtime.miniApp.isTelegram = true;
    runtime.miniApp.share.mockResolvedValue('shared');
    const onBack = vi.fn();

    const { container } = render(
      <MiniAppShell
        actions={actions}
        activePath="/"
        appName="Account App"
        description="Manage your account"
        eyebrow="Account"
        onBack={onBack}
        title="Home"
      >
        Home content
      </MiniAppShell>,
    );

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(container.firstElementChild?.getAttribute('data-mini-app-environment')).toBe('telegram');
    expect(container.firstElementChild?.getAttribute('data-mini-app-fullscreen')).toBe('true');
    expect(document.querySelector('.xr-actions')).not.toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Share' }).at(-1)!);
    await waitFor(() => {
      expect(runtime.miniApp.share).toHaveBeenCalledWith({
        text: undefined,
        title: 'Account App',
        url: window.location.href,
      });
    });
    expect(runtime.useMiniAppBackButton).toHaveBeenCalledWith({ isVisible: false, onBack });
  });

  it('uses a root-relative share URL when no browser location exists', async () => {
    vi.stubGlobal('location', undefined);
    render(
      <MiniAppShell
        actions={actions}
        activePath="/"
        appName="Account App"
        description="Manage your account"
        eyebrow="Account"
        onBack={vi.fn()}
        title="Home"
      >
        Home content
      </MiniAppShell>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Share' })[0]!);
    await waitFor(() => {
      expect(runtime.miniApp.share).toHaveBeenCalledWith(expect.objectContaining({ url: '/' }));
    });
  });
});
