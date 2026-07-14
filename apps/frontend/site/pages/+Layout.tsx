import type { ReactNode } from 'react';
import { FrontendI18nProvider, FrontendQueryProvider, FrontendStateProvider, useI18n } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';

import '../styles/site.css';

type SiteLayoutProps = Readonly<{
  children: ReactNode;
}>;

function SiteShell({ children }: SiteLayoutProps) {
  const { t } = useI18n();

  return (
    <main className="site-shell">
      <nav className="site-nav" aria-label={t('user.appName')}>
        <a href="/">{t('user.appName')}</a>
      </nav>
      {children}
    </main>
  );
}

export function Layout({ children }: SiteLayoutProps) {
  return (
    <FrontendStateProvider>
      <FrontendQueryProvider>
        <FrontendI18nProvider translations={userFrontendTranslations}>
          <SiteShell>{children}</SiteShell>
        </FrontendI18nProvider>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
}
