/* v8 ignore file -- exercised by app-level integration and browser smoke tests. */
import type { ReactNode } from 'react';
import { UiButton } from './button';
import { UiDialog } from './dialog';
import { UiToast } from './feedback';
import { UiNotification } from './notification';
import { cn } from '../util/cn';

export interface UiRuntimeProblemPresentation {
  customDescription?: string;
  display: 'custom' | 'modal';
  figmaOnly: boolean;
  lines: readonly string[];
  ruleId: string;
  severity: 'error' | 'info' | 'success' | 'warning';
  support: boolean;
}

export interface UiRuntimeToast {
  category: 'error' | 'info' | 'success' | 'warning';
  id: string;
  message?: string;
  title: string;
}

export interface UiApiRuntimeOverlayCopy {
  apiNotificationsLabel: string;
  apiRuntimeStatusLabel: string;
  authRequiredTitle: string;
  continueToSignInLabel: string;
  defaultAuthDescription: string;
  defaultOfflineMessage: string;
  defaultPresentationTitle: string;
  defaultServerErrorMessage: string;
  dismissLabel: string;
  offlineTitle: string;
  serverErrorTitle: string;
  supportGuidance: string;
}

export interface UiApiRuntimeOverlayProps {
  authAction?: ReactNode;
  authRequired?: boolean;
  className?: string;
  copy?: Partial<UiApiRuntimeOverlayCopy>;
  lastError?: { message: string } | null;
  onAuthDismiss?: () => void;
  onDismissPresentation?: () => void;
  onDismissToast?: (id: string) => void;
  presentation?: UiRuntimeProblemPresentation | null;
  redirectTo?: string | null;
  status?: 'online' | 'offline' | 'server-error';
  toasts?: readonly UiRuntimeToast[];
}

const toastTone = (category: UiRuntimeToast['category']): 'info' | 'success' | 'warning' => {
  if (category === 'success') {
    return 'success';
  }
  if (category === 'warning' || category === 'error') {
    return 'warning';
  }
  return 'info';
};

const toastMessage = (toast: UiRuntimeToast): string =>
  toast.message ? `${toast.title}: ${toast.message}` : toast.title;

const defaultOverlayCopy: UiApiRuntimeOverlayCopy = {
  apiNotificationsLabel: 'API notifications',
  apiRuntimeStatusLabel: 'API runtime status',
  authRequiredTitle: 'Authentication required',
  continueToSignInLabel: 'Continue to sign in',
  defaultAuthDescription: 'Your session must be refreshed before this route can load protected data.',
  defaultOfflineMessage: 'You are offline. We will keep this route mounted while the connection recovers.',
  defaultPresentationTitle: 'Request failed',
  defaultServerErrorMessage: 'The API is temporarily unavailable. Please retry in a moment.',
  dismissLabel: 'Dismiss',
  offlineTitle: 'Offline mode',
  serverErrorTitle: 'Service interruption',
  supportGuidance: 'Contact support if this problem continues.',
};

export const UiApiRuntimeOverlay = ({
  authAction,
  authRequired = false,
  className,
  copy,
  onAuthDismiss,
  onDismissPresentation,
  onDismissToast,
  presentation,
  redirectTo,
  status = 'online',
  toasts = [],
}: Readonly<UiApiRuntimeOverlayProps>) => {
  const isOffline = status === 'offline';
  const isServerError = status === 'server-error';
  const overlayCopy = { ...defaultOverlayCopy, ...copy };

  return (
    <aside
      aria-label={overlayCopy.apiRuntimeStatusLabel}
      className={cn('xr-runtime-overlay', className)}
      data-runtime-status={status}
    >
      {isOffline || isServerError ? (
        <UiNotification
          className="xr-runtime-overlay__banner"
          message={isOffline ? overlayCopy.defaultOfflineMessage : overlayCopy.defaultServerErrorMessage}
          role="alert"
          title={isOffline ? overlayCopy.offlineTitle : overlayCopy.serverErrorTitle}
          tone="warning"
        />
      ) : null}
      <div
        aria-label={overlayCopy.apiNotificationsLabel}
        aria-live="polite"
        className="xr-runtime-overlay__toasts"
        role="status"
      >
        {toasts.map((toast) => (
          <div className="xr-runtime-overlay__toast" key={toast.id}>
            <UiToast message={toastMessage(toast)} tone={toastTone(toast.category)} />
            {onDismissToast ? (
              <UiButton
                aria-label={`${overlayCopy.dismissLabel} ${toast.title}`}
                onClick={() => {
                  onDismissToast(toast.id);
                }}
                variant="secondary"
              >
                {overlayCopy.dismissLabel}
              </UiButton>
            ) : null}
          </div>
        ))}
      </div>
      <UiDialog
        className={`xr-api-runtime-dialog xr-api-runtime-dialog--${presentation?.display ?? 'modal'}`}
        description={presentation?.customDescription ?? ''}
        onOpenChange={
          onDismissPresentation
            ? (next) => {
                if (!next) {
                  onDismissPresentation();
                }
              }
            : undefined
        }
        open={Boolean(presentation)}
        title={presentation?.lines[0] ?? presentation?.customDescription ?? overlayCopy.defaultPresentationTitle}
      >
        {presentation ? (
          <div data-presentation-mode={presentation.display} data-rule-id={presentation.ruleId}>
            {presentation.lines.slice(1).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {presentation.support ? <p>{overlayCopy.supportGuidance}</p> : null}
          </div>
        ) : null}
      </UiDialog>
      <UiDialog
        className="xr-api-runtime-dialog"
        description={overlayCopy.defaultAuthDescription}
        onOpenChange={
          onAuthDismiss
            ? (next) => {
                if (!next) {
                  onAuthDismiss();
                }
              }
            : undefined
        }
        open={authRequired}
        title={overlayCopy.authRequiredTitle}
      >
        {authAction ?? <UiButton href={redirectTo ?? '/auth'}>{overlayCopy.continueToSignInLabel}</UiButton>}
      </UiDialog>
    </aside>
  );
};
