import { observer, useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { useAuthSessionFlow } from '../../../features/auth';
import { SocialAuthButtons, useSocialAuth } from '../../../features/social-auth';
import { UiSection } from '../../../shared/ui';
import { isTelegramAuthEnabled } from '../../../shared/config';
import { AuthPanel } from '../../../widgets/auth-panel';
import { ProfileStatusCard } from '../../../widgets/profile-status';

interface AuthPageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const AuthPage = observer(function AuthPage({
  applyUserLocale,
  applyUserTheme,
  navigate,
}: Readonly<AuthPageProps>) {
  const { locale, t } = useI18n();
  const returnUrl = new URLSearchParams(globalThis.location.search).get('returnUrl') ?? null;
  const authSession = useAuthSessionFlow({
    applyUserLocale,
    applyUserTheme,
    locale,
    messages: {
      authenticationFailed: t('user.error.authenticationFailed'),
      missingToken: t('user.state.missingToken'),
      profileRequestFailed: t('user.error.profileRequestFailed'),
      profileUnknown: t('user.profile.unknown'),
    },
    navigate,
    returnUrl,
  });
  const socialAuth = useSocialAuth({ navigate });

  return (
    <UiSection className="user-auth" eyebrow={t('user.nav.auth')} title={t('user.auth.title')}>
      <p className="user-page-intro">{t('user.auth.description')}</p>
      <AuthPanel
        isLoginPending={authSession.isLoginPending}
        isRegisterPending={authSession.isRegisterPending}
        loadingLabel={t('user.loadingProfile')}
        onAuthSubmit={authSession.submitAuth}
        socialAuthSlot={
          <SocialAuthButtons
            isDiscordPending={socialAuth.isDiscordPending}
            isTelegramPending={socialAuth.isTelegramOidcPending}
            isTelegramEnabled={isTelegramAuthEnabled()}
            onDiscord={(intent) => {
              socialAuth.continueWithDiscord({ intent });
            }}
            onTelegram={(intent) => {
              socialAuth.continueWithTelegram({ intent, returnUrl: returnUrl ?? undefined });
            }}
            t={t}
          />
        }
        t={t}
      >
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </AuthPanel>
    </UiSection>
  );
});
