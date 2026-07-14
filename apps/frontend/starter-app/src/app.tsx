import { FrontendI18nProvider, FrontendQueryProvider, FrontendStateProvider, useI18n } from '@app/frontend-runtime';

function AppShell() {
  const { t } = useI18n();

  return (
    <main>
      <h1>{document.title}</h1>
      <p>{t('common.ready')}</p>
    </main>
  );
}

export function App() {
  return (
    <FrontendStateProvider>
      <FrontendQueryProvider>
        <FrontendI18nProvider>
          <AppShell />
        </FrontendI18nProvider>
      </FrontendQueryProvider>
    </FrontendStateProvider>
  );
}
