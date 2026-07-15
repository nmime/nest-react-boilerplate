import { useState, type ReactNode } from 'react';
import { useMiniApp, useMiniAppBackButton } from '@app/frontend-runtime';
import { ProductShell, type ProductShellAction, type ProductShellProps } from './product-shell';

export interface MiniAppShellProps extends Omit<ProductShellProps, 'children' | 'headerLeading' | 'headerTrailing'> {
  activePath: string;
  backLabel?: string;
  children: ReactNode;
  onBack: () => void;
  shareLabel?: string;
  shareText?: string;
  shareTitle?: string;
}

const getShareUrl = (): string => {
  if (typeof location === 'undefined') {
    return '/';
  }
  return location.href;
};

const bottomActionKey = (action: ProductShellAction) => `${action.href}:${action.label}`;

export function MiniAppShell({
  activePath,
  actions,
  appName,
  backLabel = 'Back',
  children,
  onBack,
  shareLabel = 'Share',
  shareText,
  shareTitle,
  ...productShellProps
}: Readonly<MiniAppShellProps>) {
  const miniApp = useMiniApp();
  const [shareResult, setShareResult] = useState<string | null>(null);
  const canGoBack = activePath !== '/';
  useMiniAppBackButton({ isVisible: canGoBack, onBack });

  const handleShare = async () => {
    const result = await miniApp.share({
      text: shareText,
      title: shareTitle ?? appName,
      url: getShareUrl(),
    });
    setShareResult(result);
  };

  const backControl =
    !miniApp.isTelegram && canGoBack ? (
      <button
        aria-label={backLabel}
        className="xr-mini-app-control xr-mini-app-control--back"
        onClick={onBack}
        type="button"
      >
        <span aria-hidden="true">←</span>
        <span>{backLabel}</span>
      </button>
    ) : null;
  const shareControl = (
    <button
      aria-label={shareLabel}
      className="xr-mini-app-control xr-mini-app-control--share"
      data-share-result={shareResult ?? 'idle'}
      onClick={() => void handleShare()}
      type="button"
    >
      <span aria-hidden="true">↗</span>
      <span>{shareResult === 'copied' ? 'Copied' : shareLabel}</span>
    </button>
  );

  return (
    <div
      className="xr-mini-app-shell"
      data-mini-app-environment={miniApp.environment}
      data-mini-app-fullscreen={miniApp.isFullscreen}
    >
      <ProductShell
        {...productShellProps}
        actions={actions}
        appName={appName}
        headerLeading={backControl}
        headerTrailing={shareControl}
      >
        {children}
      </ProductShell>
      <nav aria-label={`${appName} bottom navigation`} className="xr-mini-app-bottom-bar">
        {actions.map((action) => (
          <a
            aria-current={action.isCurrent ? 'page' : undefined}
            className="xr-mini-app-bottom-bar__action"
            data-current={action.isCurrent ?? false}
            href={action.href}
            key={bottomActionKey(action)}
          >
            {action.label}
          </a>
        ))}
        <button
          className="xr-mini-app-bottom-bar__action xr-mini-app-bottom-bar__share"
          onClick={() => void handleShare()}
          type="button"
        >
          {shareResult === 'copied' ? 'Copied' : shareLabel}
        </button>
      </nav>
      <span aria-live="polite" className="sr-only">
        {shareResult === 'copied' ? 'Share link copied to clipboard.' : null}
      </span>
    </div>
  );
}
