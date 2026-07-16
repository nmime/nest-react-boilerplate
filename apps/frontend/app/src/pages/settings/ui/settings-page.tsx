import { useI18n } from '@app/frontend-runtime';
import { LogoutButton } from '../../../features/logout';
import { ProviderIdentitiesPanel, SocialAuthProvider, useSocialAuth } from '../../../features/social-auth';
import { LanguageSwitcher, ThemeSwitcher, UiCard, UiSection } from '../../../shared/ui';

interface SettingsPageProps {
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const linkRoute: Record<SocialAuthProvider, string> = {
  [SocialAuthProvider.Discord]: '/link/discord',
  [SocialAuthProvider.Telegram]: '/link/telegram',
};

export function SettingsPage({ navigate }: Readonly<SettingsPageProps>) {
  const { t } = useI18n();
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
