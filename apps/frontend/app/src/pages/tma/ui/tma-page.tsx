import { useI18n } from '@app/frontend-runtime';
import { useSocialAuth } from '../../../features/social-auth';
import { TmaAuthPanel, useTmaAuth } from '../../../features/tma-auth';
import { UiSection } from '../../../shared/ui';

interface TmaPageProps {
  fallbackStartParam?: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export function TmaPage({ fallbackStartParam, navigate }: Readonly<TmaPageProps>) {
  const { t } = useI18n();
  const socialAuth = useSocialAuth({ navigate });
  const state = useTmaAuth({
    error: socialAuth.telegramTmaError,
    fallbackStartParam,
    isVerifying: socialAuth.isTelegramTmaPending,
    onAuthenticate: socialAuth.authenticateTelegramTma,
    status: socialAuth.telegramTmaStatus,
  });

  return (
    <UiSection className="user-tma" eyebrow={t('auth.provider.telegram')} title={t('tma.title')}>
      <div className="user-page-stack">
        <p className="user-page-intro">{t('tma.description')}</p>
        <TmaAuthPanel
          deepNavigationState={state.deepNavigationState}
          error={state.error}
          intent={state.intent}
          isTelegram={state.isTelegram}
          isVerifying={state.isVerifying}
          status={state.status}
          t={t}
        />
      </div>
    </UiSection>
  );
}
