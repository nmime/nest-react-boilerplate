import type { TranslationKey, TranslationParams } from '@app/frontend-runtime';
import { getErrorReason } from '../../../shared/lib';
import { UiAlert, UiCard, UiLoading, UiToast } from '../../../shared/ui';
import type { TmaDeepNavigationState, TmaLaunchIntent } from '../model';

interface TmaAuthPanelProps {
  deepNavigationState: TmaDeepNavigationState;
  error: unknown;
  intent: TmaLaunchIntent;
  isTelegram: boolean;
  isVerifying: boolean;
  status: string;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

const getDeepNavigationMessageKey = (state: TmaDeepNavigationState): TranslationKey | null => {
  if (state === 'loading') {
    return 'tma.deepNavigation.loading';
  }

  if (state === 'not-found') {
    return 'tma.deepNavigation.notFound';
  }

  if (state === 'unsupported') {
    return 'tma.deepNavigation.unsupported';
  }

  return null;
};

const getDeepNavigationTone = (state: TmaDeepNavigationState) => (state === 'not-found' ? 'warning' : 'info');

const getTmaIdleMessageKey = (isLinkIntent: boolean): TranslationKey =>
  isLinkIntent ? 'tma.link.pending' : 'tma.idle';

const getTmaSuccessMessageKey = (isLinkIntent: boolean): TranslationKey =>
  isLinkIntent ? 'tma.link.success' : 'tma.authenticated';

const getTmaErrorMessageKey = (isLinkIntent: boolean): TranslationKey =>
  isLinkIntent ? 'tma.link.error' : 'auth.social.error.invalidCallback';

export function TmaAuthPanel({
  deepNavigationState,
  error,
  intent,
  isTelegram,
  isVerifying,
  status,
  t,
}: Readonly<TmaAuthPanelProps>) {
  const isLinkIntent = intent === 'link';
  const deepNavigationMessageKey = getDeepNavigationMessageKey(deepNavigationState);
  const showIdleState = isTelegram && status === 'idle' && !isVerifying;

  return (
    <UiCard className="user-tma__card" title={t('tma.title')}>
      {!isTelegram ? <UiToast message={t('tma.unsupported')} tone="warning" /> : null}
      {deepNavigationMessageKey ? (
        <UiToast message={t(deepNavigationMessageKey)} tone={getDeepNavigationTone(deepNavigationState)} />
      ) : null}
      {isVerifying ? (
        <UiAlert tone="info">
          <UiLoading label={t('tma.loading')} />
        </UiAlert>
      ) : null}
      {showIdleState ? <UiToast message={t(getTmaIdleMessageKey(isLinkIntent))} tone="info" /> : null}
      {status === 'success' ? <UiToast message={t(getTmaSuccessMessageKey(isLinkIntent))} tone="success" /> : null}
      {status === 'error' ? (
        <UiToast
          message={getErrorReason(
            error,
            t(getTmaErrorMessageKey(isLinkIntent), {
              provider: t('auth.provider.telegram'),
            }),
          )}
          tone="warning"
        />
      ) : null}
    </UiCard>
  );
}
