import { observer, useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { useAuthSessionFlow } from '../../../features/auth';
import { UiSection } from '../../../shared/ui';
import { ProfileStatusCard } from '../../../widgets/profile-status';

interface ProfilePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
}

export const ProfilePage = observer(function ProfilePage({
  applyUserLocale,
  applyUserTheme,
}: Readonly<ProfilePageProps>) {
  const { locale, t } = useI18n();
  const authSession = useAuthSessionFlow({
    applyUserLocale,
    applyUserTheme,
    locale,
    messages: {
      authenticationFailed: t('user.error.authenticationFailed'),
      unauthenticated: t('user.state.unauthenticated'),
      profileRequestFailed: t('user.error.profileRequestFailed'),
      profileUnknown: t('user.profile.unknown'),
    },
  });

  return (
    <UiSection className="user-profile" eyebrow={t('user.nav.profile')} title={t('user.profile.title')}>
      <div className="user-page-stack">
        <p className="user-page-intro">{t('user.home.profile.description')}</p>
        <ProfileStatusCard state={authSession.profileState} t={t} />
      </div>
    </UiSection>
  );
});
