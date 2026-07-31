import { useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { useAuthSessionProbe } from '../../../features/auth';
import { LogoutButton } from '../../../features/logout';
import { ProviderIdentitiesPanel, SocialAuthProvider, useSocialAuth } from '../../../features/social-auth';
import { LanguageSwitcher, ThemeSwitcher, UiCard, UiSection } from '../../../shared/ui';

interface SettingsPageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const linkRoute: Record<SocialAuthProvider, string> = {
  [SocialAuthProvider.Discord]: '/link/discord',
  [SocialAuthProvider.Telegram]: '/link/telegram',
};

export function SettingsPage({ applyUserLocale, applyUserTheme, navigate }: Readonly<SettingsPageProps>) {
  const { locale, t } = useI18n();
  useAuthSessionProbe({
    applyUserLocale,
    applyUserTheme,
    locale,
    redirectOnUnauthenticated: false,
  });
  const socialAuth = useSocialAuth({ navigate });

  return (
    <UiSection className="user-settings" eyebrow={t('user.nav.settings')} title={t('user.settings.title')}>
      <p className="user-page-intro">{t('user.settings.description')}</p>
      <div className="user-settings__grid">
        <UiCard className="user-settings__card" title={t('user.settings.preferences.title')}>
          <p>{t('user.settings.preferences.description')}</p>
          <div className="user-settings__controls">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
          <div className="user-settings__sign-out">
            <LogoutButton navigate={navigate} t={t} />
          </div>
        </UiCard>
        <ProviderIdentitiesPanel
          onLink={(provider) => {
            if (provider === SocialAuthProvider.Discord) {
              socialAuth.continueWithDiscord({ intent: 'link' });
              return;
            }
            navigate(linkRoute[provider], { replace: false });
          }}
          t={t}
        />
      </div>
    </UiSection>
  );
}
