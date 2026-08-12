import { observer, useI18n } from '@app/frontend-runtime';
import { UiButton, UiCard, UiSection } from '../../../shared/ui';
import './user-home.css';

const homeDestinations = [
  {
    descriptionKey: 'user.auth.description',
    href: '/auth',
    titleKey: 'user.auth.title',
  },
  {
    descriptionKey: 'user.home.profile.description',
    href: '/profile',
    titleKey: 'user.profile.title',
  },
  {
    descriptionKey: 'user.home.settings.description',
    href: '/settings',
    titleKey: 'user.settings.title',
  },
  {
    descriptionKey: 'user.home.telegram.description',
    href: '/tma',
    titleKey: 'tma.title',
  },
] as const;

/**
 * Content for the user home route (`/`). Rendered inside `UserShell`'s
 * `<Outlet/>`; the surrounding chrome lives in the shell, not here.
 */
export const UserHomeContent = observer(function UserHomeContent() {
  const { t } = useI18n();

  return (
    <UiSection className="user-home" eyebrow={t('user.eyebrow')} title={t('user.home.title')}>
      <p className="user-page-intro">{t('user.home.intro')}</p>
      <div className="user-home__grid">
        {homeDestinations.map((destination) => (
          <UiCard className="user-home__card" key={destination.href} title={t(destination.titleKey)}>
            <p>{t(destination.descriptionKey)}</p>
            <UiButton href={destination.href} variant="secondary">
              {t('user.action.open')}
            </UiButton>
          </UiCard>
        ))}
      </div>
    </UiSection>
  );
});
