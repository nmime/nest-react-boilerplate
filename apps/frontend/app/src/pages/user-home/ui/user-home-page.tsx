import type { ReactNode } from 'react';
import { observer, useI18n, type Locale, type UiTheme } from '@app/frontend-runtime';
import { MiniAppShell, UiButton, UiCard, UiSection } from '../../../shared/ui';

export interface UserHomePageProps {
  applyUserLocale: (locale: Locale) => void;
  applyUserTheme: (theme: UiTheme) => void;
  actions?: Array<{
    href: string;
    isCurrent?: boolean;
    label: string;
    variant?: 'primary' | 'secondary';
  }>;
  activeRoute?: string;
  children?: ReactNode;
  onBack?: () => void;
}

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

function UserHomeContent() {
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
}

export const UserHomePage = observer(function UserHomePage({
  activeRoute = '/',
  actions,
  children,
  onBack = () => {
    globalThis.history.back();
  },
}: Readonly<UserHomePageProps>) {
  const { t } = useI18n();
  const productActions = actions ?? [
    { href: '/', isCurrent: activeRoute === '/', label: t('user.nav.home') },
    {
      href: '/profile',
      isCurrent: activeRoute === '/profile',
      label: t('user.action.profile'),
      variant: 'secondary' as const,
    },
    {
      href: '/settings',
      isCurrent: activeRoute === '/settings',
      label: t('user.nav.settings'),
      variant: 'secondary' as const,
    },
    {
      href: '/tma',
      isCurrent: activeRoute.startsWith('/tma'),
      label: t('auth.provider.telegram'),
      variant: 'secondary' as const,
    },
  ];

  return (
    <MiniAppShell
      activePath={activeRoute}
      actions={productActions}
      appName={t('user.appName')}
      description={t('user.description')}
      eyebrow={t('user.eyebrow')}
      heroActions={[]}
      onBack={onBack}
      shareText={t('user.description')}
      shareTitle={t('user.appName')}
      title={t('user.title')}
    >
      {children ?? <UserHomeContent />}
    </MiniAppShell>
  );
});
